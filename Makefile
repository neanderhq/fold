.PHONY: install dev check

export COREPACK_HOME := $(CURDIR)/.cache/corepack
export COREPACK_ENABLE_DOWNLOAD_PROMPT := 0

install:
	corepack pnpm install --frozen-lockfile

dev:
	corepack pnpm dev

check:
	corepack pnpm check
