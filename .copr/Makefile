srpm:
	mkdir -p $(outdir)
	cp packaging/ensure-extracted-app.sh $(outdir)/
	cp packaging/ensure-electron.sh $(outdir)/
	cp packaging/eagle.metainfo.xml $(outdir)/
	cp extract-installer.py $(outdir)/
	cp eagle-unpacked-layout.json $(outdir)/
	cp patch.js $(outdir)/
	# patches/ is a directory, and an SRPM can only carry files declared as
	# SourceN. Ship it as a tarball so it survives a rebuild in a clean chroot.
	tar -czf $(outdir)/patches.tar.gz patches
	cp packaging/fedora/eagle.spec $(outdir)/
	rpmbuild -bs \
		--define "_sourcedir $(outdir)" \
		--define "_srcrpmdir $(outdir)" \
		$(outdir)/eagle.spec
