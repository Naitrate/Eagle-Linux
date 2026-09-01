srpm:
	mkdir -p $(outdir)
	bash packaging/ensure-extracted-app.sh
	rpmbuild -bs \
		--define "_sourcedir $(PWD)" \
		--define "_srcrpmdir $(outdir)" \
		packaging/fedora/eagle.spec
