# Bud on the Wilson droplet, reached over Tailscale only.
#   https://ubuntu-s-1vcpu-2gb-70gb-intel-atl1-01-wilsonv13.taild2d4ba.ts.net:8443
#
#   make deploy     ship the last commit, rebuild, restart
#   make env        write .env.production on the droplet from Doppler (dev config)
#   make db-pull    copy the droplet's database down to data/bud.db (backs up the local one)
#   make db-push    ONE-TIME: replace the droplet's database with the local one (CONFIRM=yes)
#   make logs / make status
#
# The droplet's database is the real one. Don't sync banks from the Mac.

HOST    ?= root@100.93.43.14
DIR     ?= /opt/bud
COMPOSE  = docker compose --env-file .env.production -f docker-compose.prod.yml
STAMP   := $(shell date +%Y%m%d-%H%M%S)

.PHONY: deploy env db-pull db-push logs status serve

deploy:
	@git diff --quiet HEAD -- || echo "Note: uncommitted changes are NOT deployed. Shipping $$(git rev-parse --short HEAD)."
	@tmp=$$(mktemp -d) && git archive HEAD | tar -x -C $$tmp && \
	  rsync -az --delete --no-owner --no-group --chmod=D755,F644 --exclude /data/ --exclude /.env.production $$tmp/ $(HOST):$(DIR)/ && rm -rf $$tmp
	ssh $(HOST) 'chmod 755 $(DIR) && cd $(DIR) && mkdir -p data && chown 1001:1001 data && $(COMPOSE) up -d --build'
	@ssh $(HOST) 'for i in $$(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3100/ && echo "Bud is up." && exit 0; sleep 2; done; echo "Bud did not answer on :3100"; exit 1'

env:
	doppler secrets download --no-file --format env --config dev | grep -v '^DOPPLER_' | \
	  ssh $(HOST) 'mkdir -p $(DIR) && umask 077 && cat > $(DIR)/.env.production && echo "wrote $(DIR)/.env.production"'

db-pull:
	@[ ! -f data/bud.db ] || sqlite3 data/bud.db ".backup data/bud.db.before-pull-$(STAMP)"
	ssh $(HOST) 'docker exec bud node -e "require(\"better-sqlite3\")(\"/app/data/bud.db\").backup(\"/app/data/pull.db\").then(()=>process.exit(0))"'
	scp $(HOST):$(DIR)/data/pull.db data/bud.db.pulled && ssh $(HOST) 'rm -f $(DIR)/data/pull.db'
	rm -f data/bud.db-wal data/bud.db-shm && mv data/bud.db.pulled data/bud.db
	@echo "data/bud.db is now the droplet's copy."

db-push:
	@[ "$(CONFIRM)" = "yes" ] || { echo "This replaces the droplet's database. Run: make db-push CONFIRM=yes"; exit 1; }
	sqlite3 data/bud.db ".backup /tmp/bud-push-$(STAMP).db"
	ssh $(HOST) 'mkdir -p $(DIR)/data/backups && if [ -f $(DIR)/data/bud.db ]; then cd $(DIR) && $(COMPOSE) stop bud && cp data/bud.db data/backups/bud-$(STAMP).db; fi'
	scp /tmp/bud-push-$(STAMP).db $(HOST):$(DIR)/data/bud.db && rm -f /tmp/bud-push-$(STAMP).db
	ssh $(HOST) 'cd $(DIR) && rm -f data/bud.db-wal data/bud.db-shm && chown -R 1001:1001 data && ($(COMPOSE) start bud 2>/dev/null || true)'

serve:
	ssh $(HOST) 'tailscale serve --bg --https=8443 http://127.0.0.1:3100 && tailscale serve status'

logs:
	ssh $(HOST) 'docker logs --tail 100 -f bud'

status:
	ssh $(HOST) 'docker ps --filter name=bud --format "{{.Names}} {{.Status}}"; tailscale serve status'
