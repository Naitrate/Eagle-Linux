#!/usr/bin/env python3
"""
Eagle Installer Content Extractor
(NSIS LZMA + Electron ASAR + ASAR-unpacked payload)

Normal operation:

    python3 extract-installer.py INSTALLER.exe OUTPUT_DIR

The extractor expects a layout manifest:

    eagle-unpacked-layout.json

The manifest contains the physical decompressed-payload offsets of the
ASAR-unpacked files. This makes the Nix build completely independent of
the developer's local extracted_app/ reference tree.

The manifest can be generated once with:

    EAGLE_REFERENCE_APP=/path/to/extracted_app \
    python3 extract-installer.py \
        --generate-layout \
        Eagle-4.0-x64-build23.exe \
        eagle-unpacked-layout.json

After generating the manifest, normal extraction does NOT require
EAGLE_REFERENCE_APP.

The manifest records:

    relative path
    payload offset
    size
    SHA-256

The SHA-256 is verified against the decompressed installer payload before
a file is written.
"""

import hashlib
import json
import lzma
import os
import struct
import sys


# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------

DEFAULT_LAYOUT_FILE = "eagle-unpacked-layout.json"


# ----------------------------------------------------------------------
# Utility
# ----------------------------------------------------------------------

def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    h = hashlib.sha256()

    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)

            if not chunk:
                break

            h.update(chunk)

    return h.hexdigest()


# ----------------------------------------------------------------------
# ASAR extraction
# ----------------------------------------------------------------------

def unpack_asar(
    asar_data,
    output_dir
):
    """
    Extract normal, non-unpacked files from an ASAR archive.
    """

    if len(asar_data) < 16:
        raise ValueError(
            "Invalid ASAR archive: data too short"
        )

    (
        _version,
        total_header_size,
        _json_size,
        json_len
    ) = struct.unpack(
        "<IIII",
        asar_data[:16]
    )

    json_start = 16
    json_end = json_start + json_len

    if json_end > len(asar_data):
        raise ValueError(
            "ASAR JSON header extends beyond archive"
        )

    header = json.loads(
        asar_data[
            json_start:
            json_end
        ].decode("utf-8")
    )

    payload_base = (
        8 +
        total_header_size
    )

    def extract_node(
        node,
        current_rel_path=""
    ):
        if "files" not in node:
            return

        for filename, child in node["files"].items():

            rel_path = os.path.join(
                current_rel_path,
                filename
            )

            if "files" in child:
                extract_node(
                    child,
                    rel_path
                )
                continue

            if (
                "size" not in child or
                "offset" not in child
            ):
                continue

            if child.get("unpacked"):
                continue

            offset = int(child["offset"])
            size = int(child["size"])

            start = payload_base + offset
            end = start + size

            if start < 0 or end > len(asar_data):
                raise RuntimeError(
                    f"ASAR file extends beyond archive: "
                    f"{rel_path}"
                )

            file_data = asar_data[
                start:
                end
            ]

            if len(file_data) != size:
                raise RuntimeError(
                    f"ASAR file has unexpected size: "
                    f"{rel_path}: "
                    f"expected {size}, "
                    f"got {len(file_data)}"
                )

            target_path = os.path.join(
                output_dir,
                rel_path
            )

            os.makedirs(
                os.path.dirname(target_path),
                exist_ok=True
            )

            with open(
                target_path,
                "wb"
            ) as out_f:
                out_f.write(file_data)

    extract_node(header)


# ----------------------------------------------------------------------
# ASAR helpers
# ----------------------------------------------------------------------

def find_unpacked_entries(
    tree,
    current_path=""
):
    """
    Return all ASAR files marked unpacked=true.

    Each item is:

        (relative_path, size)
    """

    entries = []

    if "files" not in tree:
        return entries

    for filename, item in tree["files"].items():

        rel_path = os.path.join(
            current_path,
            filename
        )

        if "files" in item:

            entries.extend(
                find_unpacked_entries(
                    item,
                    rel_path
                )
            )

        elif item.get("unpacked"):

            if "size" not in item:
                raise RuntimeError(
                    f"ASAR unpacked entry has no size: "
                    f"{rel_path}"
                )

            entries.append(
                (
                    rel_path,
                    int(item["size"])
                )
            )

    return entries


# ----------------------------------------------------------------------
# Search helpers
# ----------------------------------------------------------------------

def find_all_occurrences(
    blob,
    needle,
    start=0
):
    """
    Return every occurrence of needle at or after start.
    """

    positions = []

    if not needle:
        return positions

    search_pos = start

    while True:

        position = blob.find(
            needle,
            search_pos
        )

        if position == -1:
            break

        positions.append(position)

        search_pos = position + 1

    return positions


# ----------------------------------------------------------------------
# Reference-based layout generation
# ----------------------------------------------------------------------

def generate_layout_from_reference(
    decomp,
    unpacked_items,
    reference_root,
    search_start,
    output_layout
):
    """
    Generate a persistent physical-offset map using the known-good
    extracted application.

    This function is ONLY used once during development to create the
    layout manifest.

    The generated manifest is what the Nix build uses afterwards.
    """

    layout = {
        "format_version": 1,
        "reference_root": os.path.abspath(reference_root),
        "search_start": search_start,
        "files": {}
    }

    # Occupied byte intervals.

    used_ranges = []

    print(
        f"[*] Generating layout manifest from reference tree:"
    )

    print(
        f"    {reference_root}"
    )

    for index, (
        rel_path,
        size
    ) in enumerate(
        unpacked_items,
        start=1
    ):

        print(
            f"[*] [{index}/{len(unpacked_items)}] "
            f"{rel_path} ({size} bytes)"
        )

        reference_path = os.path.join(
            reference_root,
            rel_path
        )

        # ----------------------------------------------------------
        # Zero-byte files
        # ----------------------------------------------------------

        if size == 0:

            layout["files"][rel_path] = {
                "position": None,
                "size": 0,
                "sha256": sha256_bytes(b"")
            }

            print(
                "    [+] Zero-byte file"
            )

            continue

        # ----------------------------------------------------------
        # Reference file
        # ----------------------------------------------------------

        if not os.path.isfile(
            reference_path
        ):

            print(
                f"    [!] Reference file missing: "
                f"{reference_path}"
            )

            continue

        with open(
            reference_path,
            "rb"
        ) as f:
            reference_data = f.read()

        if not reference_data:

            print(
                "    [!] Reference file is empty"
            )

            continue

        # ----------------------------------------------------------
        # Exact-size match
        # ----------------------------------------------------------

        if len(reference_data) == size:

            positions = find_all_occurrences(
                decomp,
                reference_data,
                search_start
            )

            candidates = []

            for position in positions:

                end = position + size

                # Check for interval overlap with files already mapped.

                overlaps = False

                for (
                    used_start,
                    used_end,
                    used_path
                ) in used_ranges:

                    if (
                        position < used_end and
                        end > used_start
                    ):

                        overlaps = True
                        break

                if overlaps:
                    continue

                candidates.append(position)

            if len(candidates) == 1:

                position = candidates[0]

                layout["files"][rel_path] = {
                    "position": position,
                    "size": size,
                    "sha256": sha256_bytes(
                        reference_data
                    )
                }

                used_ranges.append(
                    (
                        position,
                        position + size,
                        rel_path
                    )
                )

                print(
                    f"    [+] Located at "
                    f"0x{position:X}"
                )

                continue

            if len(candidates) > 1:

                # Prefer a candidate whose bytes match exactly.
                #
                # They already do, since this is an exact search.
                # We therefore cannot disambiguate safely.

                print(
                    f"    [!] Found "
                    f"{len(candidates)} "
                    f"unassigned identical occurrences"
                )

                print(
                    "        "
                    "Skipping ambiguous file; "
                    "do not guess"
                )

                continue

            if positions:

                print(
                    "    [!] Matching bytes exist, "
                    "but all occurrences overlap files "
                    "already assigned"
                )

            else:

                print(
                    "    [!] Exact bytes not found"
                )

            continue

        # ----------------------------------------------------------
        # Different-size reference
        #
        # The known-good application can differ from the installer
        # contents for some files. Use a strong prefix anchor.
        # ----------------------------------------------------------

        print(
            f"    [!] Reference size mismatch: "
            f"installer={size}, "
            f"reference={len(reference_data)}"
        )

        anchor_length = min(
            128,
            len(reference_data)
        )

        if anchor_length < 16:

            print(
                "    [!] Reference too small for safe anchor"
            )

            continue

        anchor = reference_data[
            :anchor_length
        ]

        positions = find_all_occurrences(
            decomp,
            anchor,
            search_start
        )

        candidates = []

        for position in positions:

            end = position + size

            if end > len(decomp):
                continue

            overlaps = False

            for (
                used_start,
                used_end,
                used_path
            ) in used_ranges:

                if (
                    position < used_end and
                    end > used_start
                ):

                    overlaps = True
                    break

            if not overlaps:
                candidates.append(position)

        if len(candidates) != 1:

            print(
                f"    [!] Could not uniquely locate "
                f"{rel_path}: "
                f"{len(candidates)} candidates"
            )

            continue

        position = candidates[0]

        file_data = decomp[
            position:
            position + size
        ]

        layout["files"][rel_path] = {
            "position": position,
            "size": size,
            "sha256": sha256_bytes(file_data)
        }

        used_ranges.append(
            (
                position,
                position + size,
                rel_path
            )
        )

        print(
            f"    [+] Located using "
            f"{anchor_length}-byte anchor at "
            f"0x{position:X}"
        )

    # --------------------------------------------------------------
    # Save manifest
    # --------------------------------------------------------------

    layout_dir = os.path.dirname(
        os.path.abspath(output_layout)
    )

    if layout_dir:
        os.makedirs(
            layout_dir,
            exist_ok=True
        )

    with open(
        output_layout,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            layout,
            f,
            indent=2,
            sort_keys=True
        )

        f.write("\n")

    print(
        f"\n[+] Wrote layout manifest:"
    )

    print(
        f"    {output_layout}"
    )

    print(
        f"[+] Recorded "
        f"{len(layout['files'])} / "
        f"{len(unpacked_items)} "
        f"unpacked files"
    )

    return layout


# ----------------------------------------------------------------------
# Layout manifest
# ----------------------------------------------------------------------

def load_layout(
    layout_path
):
    """
    Load the persistent unpacked-file layout manifest.
    """

    if not os.path.isfile(
        layout_path
    ):
        raise RuntimeError(
            "Unpacked-file layout manifest is missing:\n"
            f"  {layout_path}\n\n"
            "Generate it once with:\n"
            "  EAGLE_REFERENCE_APP=/path/to/extracted_app "
            "python3 extract-installer.py "
            "--generate-layout "
            "<installer.exe> "
            "<layout.json>"
        )

    with open(
        layout_path,
        "r",
        encoding="utf-8"
    ) as f:

        layout = json.load(f)

    if layout.get("format_version") != 1:

        raise RuntimeError(
            f"Unsupported layout manifest version: "
            f"{layout.get('format_version')}"
        )

    if not isinstance(
        layout.get("files"),
        dict
    ):

        raise RuntimeError(
            "Invalid layout manifest: "
            "'files' must be an object"
        )

    return layout


# ----------------------------------------------------------------------
# Extract from persistent layout
# ----------------------------------------------------------------------

def extract_from_layout(
    decomp,
    unpacked_items,
    layout,
    output_dir
):
    """
    Extract ASAR-unpacked files using the persistent layout manifest.

    No reference tree is consulted.
    """

    manifest_files = layout["files"]

    print(
        f"[*] Extracting "
        f"{len(unpacked_items)} "
        f"ASAR-unpacked entries "
        f"using layout manifest..."
    )

    extracted_count = 0
    skipped_count = 0

    for index, (
        rel_path,
        asar_size
    ) in enumerate(
        unpacked_items,
        start=1
    ):

        print(
            f"[*] [{index}/{len(unpacked_items)}] "
            f"{rel_path} ({asar_size} bytes)"
        )

        entry = manifest_files.get(
            rel_path
        )

        if entry is None:

            print(
                "    [!] No layout entry; skipping"
            )

            skipped_count += 1
            continue

        manifest_size = int(
            entry["size"]
        )

        if manifest_size != asar_size:

            raise RuntimeError(
                f"Layout size mismatch for "
                f"{rel_path}: "
                f"ASAR says {asar_size}, "
                f"layout says {manifest_size}"
            )

        position = entry.get(
            "position"
        )

        dest_path = os.path.join(
            output_dir,
            rel_path
        )

        os.makedirs(
            os.path.dirname(dest_path),
            exist_ok=True
        )

        # ----------------------------------------------------------
        # Zero-byte file
        # ----------------------------------------------------------

        if asar_size == 0:

            with open(
                dest_path,
                "wb"
            ):
                pass

            extracted_count += 1

            print(
                "    [+] Zero-byte file"
            )

            continue

        # ----------------------------------------------------------
        # Validate position
        # ----------------------------------------------------------

        if position is None:

            print(
                "    [!] Layout has no physical position; "
                "skipping"
            )

            skipped_count += 1
            continue

        position = int(
            position
        )

        end = position + asar_size

        if position < 0 or end > len(decomp):

            raise RuntimeError(
                f"Invalid payload range for "
                f"{rel_path}: "
                f"0x{position:X}-0x{end:X}"
            )

        file_data = decomp[
            position:
            end
        ]

        # ----------------------------------------------------------
        # Verify SHA-256
        # ----------------------------------------------------------

        expected_sha256 = entry.get(
            "sha256"
        )

        actual_sha256 = sha256_bytes(
            file_data
        )

        if (
            expected_sha256 and
            actual_sha256 != expected_sha256
        ):

            raise RuntimeError(
                f"Payload verification failed for "
                f"{rel_path}\n"
                f"  position: 0x{position:X}\n"
                f"  expected SHA-256: {expected_sha256}\n"
                f"  actual SHA-256:   {actual_sha256}"
            )

        with open(
            dest_path,
            "wb"
        ) as out_f:

            out_f.write(
                file_data
            )

        actual_size = os.path.getsize(
            dest_path
        )

        if actual_size != asar_size:

            raise RuntimeError(
                f"Extracted size mismatch for "
                f"{rel_path}: "
                f"expected {asar_size}, "
                f"got {actual_size}"
            )

        extracted_count += 1

        print(
            f"    [+] Extracted from "
            f"0x{position:X}"
        )

    print(
        f"[+] Extracted "
        f"{extracted_count} / "
        f"{len(unpacked_items)} "
        f"unpacked files"
    )

    if skipped_count:
        print(
            f"[!] Skipped "
            f"{skipped_count} "
            f"unpacked entries"
        )

    return extracted_count


# ----------------------------------------------------------------------
# Installer extraction
# ----------------------------------------------------------------------

def extract_eagle_installer(
    exe_path,
    target_dir,
    layout_path
):
    """
    Extract the Eagle installer using the persistent layout manifest.
    """

    print(
        f"[*] Reading installer executable: "
        f"{exe_path}"
    )

    with open(
        exe_path,
        "rb"
    ) as f:

        data = f.read()

    # --------------------------------------------------------------
    # Locate NSIS payload
    # --------------------------------------------------------------

    print(
        "[*] Inspecting NSIS installer headers..."
    )

    sig = b"NullsoftInst"

    sig_pos = data.find(
        sig
    )

    if sig_pos == -1:

        raise ValueError(
            "Could not find NSIS 'NullsoftInst' "
            "signature in file."
        )

    print(
        f"[+] Found NullsoftInst signature at "
        f"offset 0x{sig_pos:X}"
    )

    lzma_marker = b"\x5d\x00\x00\x00"

    lzma_offset = data.find(
        lzma_marker,
        sig_pos
    )

    if lzma_offset == -1:

        raise ValueError(
            "Could not locate LZMA compression "
            "stream in installer."
        )

    print(
        f"[+] Found LZMA stream header at "
        f"offset 0x{lzma_offset:X}"
    )

    props = data[
        lzma_offset:
        lzma_offset + 5
    ]

    payload = data[
        lzma_offset + 5:
    ]

    # --------------------------------------------------------------
    # Decompress NSIS payload
    # --------------------------------------------------------------

    print(
        "[*] Decompressing NSIS LZMA payload..."
    )

    try:

        decomp = lzma.decompress(
            props +
            b"\xff" * 8 +
            payload,
            format=lzma.FORMAT_ALONE
        )

    except Exception as err:

        raise RuntimeError(
            f"LZMA decompression failed: {err}"
        ) from err

    print(
        f"[+] Decompressed payload size: "
        f"{len(decomp)} bytes "
        f"({len(decomp) / 1024 / 1024:.2f} MB)"
    )

    # --------------------------------------------------------------
    # Locate ASAR
    # --------------------------------------------------------------

    print(
        "[*] Locating ASAR archive stream "
        "within payload..."
    )

    pos = decomp.find(
        b"app.bundle.js"
    )

    if pos == -1:

        pos = decomp.find(
            b"package.json"
        )

    if pos == -1:

        raise ValueError(
            "Could not locate Electron application "
            "files in decompressed payload."
        )

    asar_idx = decomp.rfind(
        b"\x04\x00\x00\x00",
        0,
        pos
    )

    if asar_idx < 0:

        raise ValueError(
            "Could not locate ASAR header."
        )

    if asar_idx + 16 > len(decomp):

        raise ValueError(
            "ASAR header extends beyond "
            "decompressed payload."
        )

    (
        _asar_version,
        total_header_size,
        _json_size,
        json_len
    ) = struct.unpack(
        "<IIII",
        decomp[
            asar_idx:
            asar_idx + 16
        ]
    )

    json_start = asar_idx + 16
    json_end = json_start + json_len

    if json_end > len(decomp):

        raise ValueError(
            "ASAR JSON header extends beyond "
            "decompressed payload."
        )

    header_data = json.loads(
        decomp[
            json_start:
            json_end
        ].decode("utf-8")
    )

    # --------------------------------------------------------------
    # Determine ASAR size
    # --------------------------------------------------------------

    max_offset = 0
    max_size = 0

    def walk(obj):

        nonlocal max_offset
        nonlocal max_size

        if not isinstance(
            obj,
            dict
        ):
            return

        if (
            "offset" in obj and
            "size" in obj
        ):

            off = int(
                obj["offset"]
            )

            size = int(
                obj["size"]
            )

            if (
                off > max_offset or
                (
                    off == max_offset and
                    size > max_size
                )
            ):

                max_offset = off
                max_size = size

        for value in obj.values():
            walk(value)

    walk(
        header_data
    )

    payload_base = (
        8 +
        total_header_size
    )

    asar_total_size = (
        payload_base +
        max_offset +
        max_size
    )

    asar_end = (
        asar_idx +
        asar_total_size
    )

    if asar_end > len(decomp):

        raise ValueError(
            "Calculated ASAR extends beyond "
            "decompressed payload."
        )

    print(
        f"[+] ASAR offset: "
        f"0x{asar_idx:X}"
    )

    print(
        f"[+] ASAR size: "
        f"{asar_total_size} bytes"
    )

    print(
        f"[+] ASAR ends at "
        f"0x{asar_end:X}"
    )

    asar_data = decomp[
        asar_idx:
        asar_end
    ]

    # --------------------------------------------------------------
    # Create output
    # --------------------------------------------------------------

    os.makedirs(
        target_dir,
        exist_ok=True
    )

    # --------------------------------------------------------------
    # Save raw ASAR
    # --------------------------------------------------------------

    asar_file = os.path.join(
        target_dir,
        "app.asar"
    )

    with open(
        asar_file,
        "wb"
    ) as out_f:

        out_f.write(
            asar_data
        )

    print(
        f"[+] Extracted raw ASAR archive: "
        f"{asar_file} "
        f"({asar_total_size} bytes)"
    )

    # --------------------------------------------------------------
    # Find unpacked entries
    # --------------------------------------------------------------

    unpacked_items = find_unpacked_entries(
        header_data
    )

    print(
        f"[*] Found "
        f"{len(unpacked_items)} "
        f"ASAR-unpacked entries"
    )

    # --------------------------------------------------------------
    # Prepare output
    # --------------------------------------------------------------

    unpacked_dir = os.path.join(
        target_dir,
        "app.asar.unpacked"
    )

    os.makedirs(
        unpacked_dir,
        exist_ok=True
    )

    # --------------------------------------------------------------
    # Load layout manifest
    # --------------------------------------------------------------

    layout = load_layout(
        layout_path
    )

    print(
        f"[*] Loaded layout manifest: "
        f"{layout_path}"
    )

    print(
        f"[*] Layout contains "
        f"{len(layout['files'])} "
        f"entries"
    )

    # --------------------------------------------------------------
    # Extract unpacked files
    # --------------------------------------------------------------

    extract_from_layout(
        decomp,
        unpacked_items,
        layout,
        unpacked_dir
    )

    # --------------------------------------------------------------
    # Extract normal ASAR contents
    # --------------------------------------------------------------

    extracted_app_dir = os.path.join(
        target_dir,
        "extracted_app"
    )

    print(
        f"[*] Unpacking ASAR contents to: "
        f"{extracted_app_dir}..."
    )

    os.makedirs(
        extracted_app_dir,
        exist_ok=True
    )

    unpack_asar(
        asar_data,
        extracted_app_dir
    )

    print(
        f"[+] Unpacked all normal ASAR "
        f"application files to "
        f"{extracted_app_dir}"
    )

    print(
        "\n[+] Extraction complete."
    )


# ----------------------------------------------------------------------
# Generate-layout mode
# ----------------------------------------------------------------------

def generate_layout(
    exe_path,
    layout_path
):
    """
    Decompress the installer, locate the ASAR, then generate a layout
    manifest using EAGLE_REFERENCE_APP.
    """

    reference_root = os.environ.get(
        "EAGLE_REFERENCE_APP"
    )

    if not reference_root:

        raise RuntimeError(
            "--generate-layout requires "
            "EAGLE_REFERENCE_APP"
        )

    if not os.path.isdir(
        reference_root
    ):

        raise RuntimeError(
            "EAGLE_REFERENCE_APP does not exist:\n"
            f"  {reference_root}"
        )

    print(
        f"[*] Reading installer executable: "
        f"{exe_path}"
    )

    with open(
        exe_path,
        "rb"
    ) as f:

        data = f.read()

    # --------------------------------------------------------------
    # NSIS
    # --------------------------------------------------------------

    sig = b"NullsoftInst"

    sig_pos = data.find(
        sig
    )

    if sig_pos == -1:

        raise ValueError(
            "Could not find NSIS 'NullsoftInst' "
            "signature."
        )

    lzma_offset = data.find(
        b"\x5d\x00\x00\x00",
        sig_pos
    )

    if lzma_offset == -1:

        raise ValueError(
            "Could not locate LZMA stream."
        )

    print(
        f"[+] LZMA stream at "
        f"0x{lzma_offset:X}"
    )

    props = data[
        lzma_offset:
        lzma_offset + 5
    ]

    payload = data[
        lzma_offset + 5:
    ]

    print(
        "[*] Decompressing NSIS LZMA payload..."
    )

    decomp = lzma.decompress(
        props +
        b"\xff" * 8 +
        payload,
        format=lzma.FORMAT_ALONE
    )

    print(
        f"[+] Decompressed payload size: "
        f"{len(decomp)} bytes"
    )

    # --------------------------------------------------------------
    # ASAR
    # --------------------------------------------------------------

    pos = decomp.find(
        b"app.bundle.js"
    )

    if pos == -1:

        pos = decomp.find(
            b"package.json"
        )

    if pos == -1:

        raise ValueError(
            "Could not locate application payload."
        )

    asar_idx = decomp.rfind(
        b"\x04\x00\x00\x00",
        0,
        pos
    )

    if asar_idx < 0:

        raise ValueError(
            "Could not locate ASAR header."
        )

    (
        _asar_version,
        total_header_size,
        _json_size,
        json_len
    ) = struct.unpack(
        "<IIII",
        decomp[
            asar_idx:
            asar_idx + 16
        ]
    )

    json_start = asar_idx + 16
    json_end = json_start + json_len

    header_data = json.loads(
        decomp[
            json_start:
            json_end
        ].decode("utf-8")
    )

    max_offset = 0
    max_size = 0

    def walk(obj):

        nonlocal max_offset
        nonlocal max_size

        if not isinstance(
            obj,
            dict
        ):
            return

        if (
            "offset" in obj and
            "size" in obj
        ):

            off = int(
                obj["offset"]
            )

            size = int(
                obj["size"]
            )

            if (
                off > max_offset or
                (
                    off == max_offset and
                    size > max_size
                )
            ):

                max_offset = off
                max_size = size

        for value in obj.values():
            walk(value)

    walk(
        header_data
    )

    payload_base = (
        8 +
        total_header_size
    )

    asar_total_size = (
        payload_base +
        max_offset +
        max_size
    )

    asar_end = (
        asar_idx +
        asar_total_size
    )

    print(
        f"[+] ASAR offset: "
        f"0x{asar_idx:X}"
    )

    print(
        f"[+] ASAR ends at "
        f"0x{asar_end:X}"
    )

    unpacked_items = find_unpacked_entries(
        header_data
    )

    print(
        f"[+] Found "
        f"{len(unpacked_items)} "
        f"unpacked entries"
    )

    generate_layout_from_reference(
        decomp,
        unpacked_items,
        reference_root,
        asar_end,
        layout_path
    )


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------

def main():

    if len(sys.argv) < 3:

        print(
            "Usage:\n"
            "\n"
            "  Normal extraction:\n"
            "    python3 extract-installer.py "
            "<installer.exe> <output-dir> "
            "[layout.json]\n"
            "\n"
            "  Generate layout manifest:\n"
            "    EAGLE_REFERENCE_APP=/path/to/extracted_app \\\n"
            "    python3 extract-installer.py "
            "--generate-layout "
            "<installer.exe> <layout.json>"
        )

        sys.exit(1)

    if sys.argv[1] == "--generate-layout":

        if len(sys.argv) < 4:

            print(
                "Usage: "
                "EAGLE_REFERENCE_APP=/path/to/extracted_app "
                "python3 extract-installer.py "
                "--generate-layout "
                "<installer.exe> "
                "<layout.json>"
            )

            sys.exit(1)

        generate_layout(
            sys.argv[2],
            sys.argv[3]
        )

        return

    exe_path = sys.argv[1]
    target_dir = sys.argv[2]

    if len(sys.argv) >= 4:

        layout_path = sys.argv[3]

    else:

        layout_path = DEFAULT_LAYOUT_FILE

    extract_eagle_installer(
        exe_path,
        target_dir,
        layout_path
    )


if __name__ == "__main__":
    main()