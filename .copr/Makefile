srpm:
	mkdir -p $(outdir)
	cp packaging/ensure-extracted-app.sh $(outdir)/
	cp packaging/ensure-electron.sh $(outdir)/
	cp packaging/eagle.metainfo.xml $(outdir)/
	cp extract-installer.py $(outdir)/
	cp eagle-unpacked-layout.json $(outdir)/
	cp patch.js $(outdir)/
	cp -r patches $(outdir)/
	cp packaging/fedora/eagle.spec $(outdir)/
	rpmbuild -bs \
		--define "_sourcedir $(outdir)" \
		--define "_srcrpmdir $(outdir)" \
		$(outdir)/eagle.spec
