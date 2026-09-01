{
  description = "Unofficial Eagle Digital Asset Manager for Linux & macOS";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      rec {
        packages = rec {
          eagle = pkgs.callPackage ./default.nix { };
          default = eagle;
        };

        apps = rec {
          eagle = flake-utils.lib.mkApp { drv = packages.eagle; };
          default = eagle;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            python3
            nodejs
            appimagetool
            flatpak-builder
            cachix
          ];
        };
      }
    );
}
