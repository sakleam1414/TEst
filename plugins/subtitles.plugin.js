/**
 * @name Subtitles
 * @author Codex
 * @version 1.3.0
 * @description Чистые субтитры. ЛКМ — чистое окно, ПКМ — меню участников с проверкой Tailscale.
 */
module.exports = class Subtitles {
    start() {
        this.stop();
        const savedUsers = BdApi.Data.load("Subtitles", "selectedUsers");
        this.captionUsers = new Set(Array.isArray(savedUsers) ? savedUsers : []);
        this.participantProfiles = new Map();
        this.mutedUsers = new Set();
        this.userSubtitles = new Map();
        this.offlineUsers = new Set();
        this.port = 8765;

        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "subtitles-voice-button";
        this.button.title = "ЛКМ — Окно субтитров | ПКМ — Настройка участников в сети";
        this.button.setAttribute("aria-label", "Субтитры");
        this.button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/>
            <path d="M6 12h4M13 12h5" stroke="#9295ff" stroke-width="2" stroke-linecap="round"/>
            <path d="M6 16h8M17 16h1" stroke="#54d6e5" stroke-width="2" stroke-linecap="round"/>
            <circle cx="20" cy="5" r="2.4" fill="#f56a9a" stroke="var(--background-secondary,#1e1f22)" stroke-width="1.3"/>
        </svg>`;

        this.button.addEventListener("click", event => {
            if (event.button === 0) this.togglePanel();
        });

        this.button.addEventListener("contextmenu", event => {
            event.preventDefault();
            this.toggleParticipantMenu();
        });

        this.onSubtitleEvent = event => {
            this.handleIncomingSubtitle(event.detail);
        };
        window.addEventListener("bd-subtitle-received", this.onSubtitleEvent);

        this.startAutoServer();

        BdApi.DOM.addStyle("Subtitles", `
            .subtitles-voice-button {
                width: 30px; height: 30px; flex: 0 0 30px; padding: 3px;
                border: 0; border-radius: 8px; background: transparent;
                color: var(--interactive-normal, #b5bac1);
                display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
            }
            .subtitles-voice-button:hover { color: #fff; background: var(--background-modifier-hover, #80808022); }
            .subtitles-voice-button svg { display: block; pointer-events: none; }
            
            #subtitles-preview {
                position: fixed; z-index: 2147483001; left: 50%; bottom: 90px; transform: translateX(-50%);
                display: flex; flex-direction: column; gap: 9px; box-sizing: border-box;
                width: min(900px, calc(100vw - 32px)); padding: 14px 20px 16px;
                color: #b5c7e2; background: #111522; border: 1px solid #465579; border-radius: 16px;
                box-shadow: 0 14px 42px #0008; font: 14px/1.4 system-ui, sans-serif;
                cursor: grab; touch-action: none;
            }
            #subtitles-preview[data-dragging="true"] { cursor: grabbing; user-select: none; }
            #subtitles-preview[hidden] { display: none; }
            #subtitles-preview, #subtitles-preview * { box-sizing: border-box; }
            
            .subtitles-preview-rows { display: flex; flex-direction: column; gap: 9px; max-height: min(60vh, 520px); overflow-y: auto; }
            
            #subtitles-participant-menu {
                position: fixed; z-index: 2147483002; left: 50%; bottom: 90px; transform: translateX(-50%);
                display: flex; flex-direction: column; gap: 9px; box-sizing: border-box;
                width: min(640px, calc(100vw - 32px)); max-height: min(360px, calc(100vh - 120px));
                overflow-y: auto; padding: 14px; color: #a9c7eb; background: #111522;
                border: 1px solid #465579; border-radius: 14px; box-shadow: 0 14px 42px #0008;
            }
            #subtitles-participant-menu[hidden] { display: none; }
            
            .subtitles-ts-status { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 8px 12px; border: 1px solid #394966; border-radius: 10px; background: #131826; }
            .subtitles-ts-status-text { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .subtitles-ts-status[data-state=\"ok\"] { border-color: #36d399; color: #36d399; }
            .subtitles-ts-status[data-state=\"partial\"] { border-color: #92743b; color: #e8bf69; }
            .subtitles-ts-status[data-state=\"checking\"] { color: #9bb8df; }
            .subtitles-ts-refresh { flex: 0 0 auto; padding: 5px 10px; border: 1px solid #394966; border-radius: 8px; color: #d5d9e4; background: #1b2232; font: inherit; font-size: 12px; cursor: pointer; }
            .subtitles-ts-refresh:disabled { opacity: 0.4; cursor: default; }
            .subtitles-participant-row { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 8px 12px; background: #1b2232; border-radius: 11px; }
            .subtitles-participant-row[data-offline=\"true\"] { opacity: 0.55; }
            .subtitles-participant-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
            .subtitles-participant-name { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .subtitles-participant-state { font-size: 12px; color: #82a5ca; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .subtitles-participant-state[data-state=\"online\"] { color: #36d399; }
            .subtitles-participant-state[data-state=\"offline\"] { color: #ff6b7a; }
            .subtitles-participant-state[data-state=\"checking\"] { color: #e8bf69; }
            .subtitles-participant-state[data-state=\"unknown\"] { color: #e8bf69; }
            .subtitles-presence { width: 20px; flex: 0 0 20px; text-align: center; font-size: 18px; font-weight: 700; }
            .subtitles-presence[data-status=\"online\"] { color: #36d399; }
            .subtitles-presence[data-status=\"offline\"] { color: #ff5665; }
            .subtitles-presence[data-status=\"unknown\"], .subtitles-presence[data-status=\"checking\"] { color: #e8bf69; }
            .subtitles-participant-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: #30384a; flex: 0 0 38px; }
            .subtitles-participant-control { width: 36px; height: 36px; border: 1px solid #394966; border-radius: 10px; color: #82a5ca; background: #111827; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
            .subtitles-participant-control[aria-pressed="true"] { color: #fff; background: #5865f2; border-color: #8490ff; }
            .subtitles-participant-control:disabled { opacity: 0.3; cursor: not-allowed; }
            
            .subtitles-preview-line { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 10px 14px; background: #1b1f2d; border-radius: 10px; font-weight: 600; font-size: 15px; color: #f3f4ff; }
            .subtitles-preview-avatar { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex: 0 0 38px; }
            .subtitles-preview-text { flex: 1; white-space: pre-wrap; word-break: break-word; color: #e0e8f9; }
        `);

        this.createPreview();
        this.placeButton();
        this.voiceChannelId = this.getVoiceChannelId();
        this.observer = new MutationObserver(() => this.schedulePlacement());
        this.observer.observe(document.body, {childList: true, subtree: true});
        this.timer = setInterval(() => {
            this.placeButton();
            this.checkVoiceConnection();
        }, 1000);
    }

    startAutoServer() {
        try {
            const http = require("http");
            this.server = http.createServer((req, res) => {
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type");
                if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
                if (req.method === "GET" && req.url === "/ping") {
                    const myId = BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.()?.id || null;
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true, userId: myId }));
                    return;
                }
                if (req.method === "POST" && req.url === "/subtitle") {
                    let body = "";
                    req.on("data", chunk => { body += chunk.toString(); });
                    req.on("end", () => {
                        try {
                            const data = JSON.parse(body);
                            this.handleIncomingSubtitle(data);
                        } catch {}
                        res.writeHead(200);
                        res.end("ok");
                    });
                    return;
                }
                res.writeHead(404); res.end();
            });
            this.server.on("error", () => {});
            this.server.listen(this.port, "0.0.0.0");
        } catch (e) {
            console.error("[Subtitles] Не удалось запустить авто-сервер", e);
        }
    }

    handleIncomingSubtitle(payload) {
        if (!payload || !payload.text) return;
        const userStore = BdApi.Webpack.getStore("UserStore");
        const currentUserId = userStore?.getCurrentUser?.()?.id;
        const targetId = (!payload.userId || payload.userId === "self") ? currentUserId : payload.userId;
        if (!targetId || this.offlineUsers.has(targetId)) return;

        this.userSubtitles.set(targetId, payload.text);

        if (!this.participantProfiles.has(targetId)) {
            const user = userStore?.getUser?.(targetId) || { id: targetId, globalName: payload.userName || "Участник", getAvatarURL: () => "" };
            this.participantProfiles.set(targetId, { user, channelId: this.getVoiceChannelId() });
        }
        this.renderSelectedAvatars();
    }

    createPreview() {
        this.preview = document.createElement("section");
        this.preview.id = "subtitles-preview";
        this.preview.hidden = true;
        this.preview.addEventListener("pointerdown", e => this.beginDrag(e));
        this.preview.addEventListener("pointermove", e => this.moveDrag(e));
        this.preview.addEventListener("pointerup", e => this.endDrag(e));

        this.previewRows = document.createElement("div");
        this.previewRows.className = "subtitles-preview-rows";
        this.preview.append(this.previewRows);

        const savedPosition = BdApi.Data.load("Subtitles", "previewPosition");
        if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
            this.preview.style.left = `${savedPosition.left}px`;
            this.preview.style.top = `${savedPosition.top}px`;
            this.preview.style.right = "auto";
            this.preview.style.bottom = "auto";
            this.preview.style.transform = "none";
        }
        document.body.append(this.preview);
        this.createParticipantMenu();
    }

    beginDrag(event) {
        if (event.button !== 0 || event.target.closest("button")) return;
        const bounds = this.preview.getBoundingClientRect();
        this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: bounds.left, top: bounds.top };
        this.preview.style.left = `${bounds.left}px`;
        this.preview.style.top = `${bounds.top}px`;
        this.preview.style.right = "auto";
        this.preview.style.bottom = "auto";
        this.preview.style.transform = "none";
        this.preview.dataset.dragging = "true";
        this.preview.setPointerCapture(event.pointerId);
        event.preventDefault();
    }

    moveDrag(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        this.preview.style.left = `${Math.max(0, this.drag.left + event.clientX - this.drag.startX)}px`;
        this.preview.style.top = `${Math.max(0, this.drag.top + event.clientY - this.drag.startY)}px`;
    }

    endDrag(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        this.drag = null;
        delete this.preview.dataset.dragging;
        if (this.preview.hasPointerCapture(event.pointerId)) this.preview.releasePointerCapture(event.pointerId);
        try {
            BdApi.Data.save("Subtitles", "previewPosition", { left: this.preview.offsetLeft, top: this.preview.offsetTop });
        } catch (error) {
            console.error("[Subtitles] Could not save subtitle panel position", error);
        }
    }

    createParticipantMenu() {
        this.participantMenu = document.createElement("section");
        this.participantMenu.id = "subtitles-participant-menu";
        this.participantMenu.hidden = true;
        document.body.append(this.participantMenu);
    }

    toggleParticipantMenu() {
        if (!this.participantMenu) return;
        this.participantMenu.hidden = !this.participantMenu.hidden;
        if (!this.participantMenu.hidden) this.refreshParticipants();
        else clearTimeout(this.participantRefreshTimer);
    }

    getPeerAddress(userId) {
        const map = BdApi.Data.load("Subtitles", "peerAddresses");
        const address = map && typeof map === "object" ? map[userId] : null;
        return typeof address === "string" && address.trim() ? address.trim() : null;
    }

    async checkPeer(userId) {
        const address = this.getPeerAddress(userId);
        if (!address) return "unknown";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        try {
            const res = await fetch(`http://${address}:${this.port}/ping`, { signal: controller.signal });
            const data = await res.json();
            return data && data.ok && data.userId === userId ? "online" : "offline";
        } catch {
            return "offline";
        } finally {
            clearTimeout(timeout);
        }
    }

    setParticipantState(row, state, text) {
        row.dataset.offline = String(state === "offline");
        const label = row.querySelector(".subtitles-participant-state");
        label.dataset.state = state;
        label.textContent = text;
    }

    renderTailscaleStatus(counts) {
        const box = this.participantMenu.querySelector(".subtitles-ts-status");
        if (!box) return;
        const text = box.querySelector(".subtitles-ts-status-text");
        const { online, total, unknown, checking } = counts;
        if (checking) {
            box.dataset.state = "checking";
            text.textContent = "● Tailscale: проверка участников…";
        } else if (unknown === total - 1 && total > 1) {
            box.dataset.state = "partial";
            text.textContent = "● Tailscale: адреса участников не заданы";
        } else if (online === total) {
            box.dataset.state = "ok";
            text.textContent = `✓ Tailscale: все в сети (${online}/${total})`;
        } else {
            box.dataset.state = "partial";
            text.textContent = `● Tailscale: в сети ${online} из ${total}`;
        }
    }

    async refreshParticipants() {
        if (!this.participantMenu) return;
        const refreshId = (this.participantRefreshId || 0) + 1;
        this.participantRefreshId = refreshId;
        clearTimeout(this.participantRefreshTimer);
        this.participantMenu.replaceChildren();

        const status = document.createElement("div");
        status.className = "subtitles-ts-status";
        const statusText = document.createElement("span");
        statusText.className = "subtitles-ts-status-text";
        const refreshBtn = document.createElement("button");
        refreshBtn.type = "button";
        refreshBtn.className = "subtitles-ts-refresh";
        refreshBtn.textContent = "Проверить";
        refreshBtn.onclick = () => this.refreshParticipants();
        status.append(statusText, refreshBtn);
        this.participantMenu.append(status);

        const getStore = name => { try { return BdApi.Webpack.getStore(name); } catch { return null; } };
        const userStore = getStore("UserStore");
        const currentUser = userStore?.getCurrentUser?.();
        const channelId = this.getVoiceChannelId();
        const states = channelId ? getStore("VoiceStateStore")?.getVoiceStatesForChannel?.(channelId) : null;
        const voiceStates = states instanceof Map ? [...states.values()] : Object.values(states || {});
        const users = voiceStates.map(state => userStore?.getUser?.(state.userId || state.user_id)).filter(Boolean);
        if (currentUser && !users.some(u => u.id === currentUser.id)) users.unshift(currentUser);

        for (const u of users) {
            this.participantProfiles.set(u.id, { user: u, channelId });
        }
        this.renderSelectedAvatars();

        if (!users.length) {
            const empty = document.createElement("p");
            empty.className = "subtitles-menu-empty";
            empty.textContent = "Участники голосового канала не найдены.";
            this.participantMenu.append(empty);
            statusText.textContent = "● Tailscale: нет участников";
            status.dataset.state = "partial";
            return;
        }

        const guildId = getStore("ChannelStore")?.getChannel?.(channelId)?.guild_id;
        const rows = new Map();
        for (const user of users) {
            const row = document.createElement("div");
            row.className = "subtitles-participant-row";
            const isSelf = user.id === currentUser?.id;

            const presence = document.createElement("span");
            presence.className = "subtitles-presence";
            presence.textContent = "";

            const avatar = document.createElement("img");
            avatar.className = "subtitles-participant-avatar";
            const avatarUrl = user.getAvatarURL?.(guildId || undefined, 64, false);
            if (avatarUrl) avatar.src = avatarUrl; else avatar.hidden = true;

            const info = document.createElement("div");
            info.className = "subtitles-participant-info";
            const name = document.createElement("span");
            name.className = "subtitles-participant-name";
            name.textContent = (user.globalName || user.username || "Участник") + (isSelf ? " (вы)" : "");
            const stateLabel = document.createElement("span");
            stateLabel.className = "subtitles-participant-state";
            info.append(name, stateLabel);

            const captions = document.createElement("button");
            captions.type = "button";
            captions.className = "subtitles-participant-control";
            const isSelected = this.captionUsers.has(user.id);
            captions.setAttribute("aria-pressed", String(isSelected));
            captions.textContent = isSelected ? "✓" : "○";
            captions.onclick = () => {
                if (captions.disabled) return;
                const next = captions.getAttribute("aria-pressed") !== "true";
                captions.setAttribute("aria-pressed", String(next));
                captions.textContent = next ? "✓" : "○";
                if (next) this.captionUsers.add(user.id);
                else this.captionUsers.delete(user.id);
                BdApi.Data.save("Subtitles", "selectedUsers", [...this.captionUsers]);
                this.renderSelectedAvatars();
            };

            row.append(presence, avatar, info, captions);
            this.participantMenu.append(row);
            rows.set(user.id, { row, captions, presence });

            if (isSelf) {
                this.offlineUsers.delete(user.id);
                this.setParticipantState(row, "online", "В сети · этот ПК");
                presence.textContent = "✓";
                presence.dataset.status = "online";
                continue;
            }
            this.setParticipantState(row, "checking", "Проверка…");
            presence.textContent = "●";
            presence.dataset.status = "checking";
            captions.disabled = true;
        }

        const counts = { online: 1, total: users.length, unknown: 0, checking: true };
        this.renderTailscaleStatus(counts);
        counts.checking = false;

        const results = await Promise.all(users.filter(u => u.id !== currentUser?.id).map(async user => ({
            user,
            state: await this.checkPeer(user.id)
        })));
        if (this.participantRefreshId !== refreshId || !this.participantMenu || this.participantMenu.hidden) return;

        counts.online = 1;
        counts.unknown = 0;
        for (const { user, state } of results) {
            const entry = rows.get(user.id);
            if (!entry) continue;
            const { row, captions, presence } = entry;
            const online = state === "online";
            if (online) counts.online++;
            if (state === "unknown") counts.unknown++;
            if (online) this.offlineUsers.delete(user.id);
            else this.offlineUsers.add(user.id);

            const labels = {
                online: "В сети (Tailscale)",
                offline: "Не в сети",
                unknown: "Адрес Tailscale не задан"
            };
            this.setParticipantState(row, state, labels[state]);
            presence.textContent = online ? "✓" : state === "unknown" ? "●" : "×";
            presence.dataset.status = state === "unknown" ? "unknown" : (online ? "online" : "offline");
            captions.disabled = !online;
            captions.title = online ? "Включить/выключить субтитры" : "Недоступно: участник не в сети или адрес не задан";
        }
        counts.total = users.length;
        this.renderTailscaleStatus(counts);
        this.renderSelectedAvatars();

        this.participantRefreshTimer = setTimeout(() => {
            if (!this.participantMenu.hidden) this.refreshParticipants();
        }, 15000);
    }

    renderSelectedAvatars() {
        if (!this.previewRows) return;
        this.previewRows.replaceChildren();
        const selectedUsers = [...this.captionUsers]
            .map(id => this.participantProfiles.get(id))
            .filter(profile => profile && !this.offlineUsers.has(profile.user.id));

        for (const profile of selectedUsers) {
            const line = document.createElement("div");
            line.className = "subtitles-preview-line";
            const avatar = document.createElement("img");
            avatar.className = "subtitles-preview-avatar";
            const guildId = profile.channelId
                ? BdApi.Webpack.getStore("ChannelStore")?.getChannel?.(profile.channelId)?.guild_id
                : undefined;
            const avatarUrl = profile.user.getAvatarURL?.(guildId || undefined, 64, false);
            if (avatarUrl) avatar.src = avatarUrl; else avatar.hidden = true;

            const textSpan = document.createElement("span");
            textSpan.className = "subtitles-preview-text";
            const userName = profile.user.globalName || profile.user.username || "Участник";
            const currentText = this.userSubtitles.get(profile.user.id) || "Ожидание речи...";
            textSpan.textContent = `${userName}: ${currentText}`;

            line.append(avatar, textSpan);
            this.previewRows.append(line);
        }
    }

    togglePanel() {
        if (!this.preview) return;
        this.preview.hidden = !this.preview.hidden;
        if (!this.preview.hidden && this.participantMenu) {
            this.participantMenu.hidden = true;
        }
    }

    getVoiceChannelId() {
        try {
            const userStore = BdApi.Webpack.getStore("UserStore");
            const userId = userStore?.getCurrentUser?.()?.id;
            return BdApi.Webpack.getStore("SelectedChannelStore")?.getVoiceChannelId?.()
                || BdApi.Webpack.getStore("RTCConnectionStore")?.getChannelId?.()
                || BdApi.Webpack.getStore("VoiceStateStore")?.getVoiceStateForUser?.(userId)?.channelId
                || null;
        } catch { return null; }
    }

    checkVoiceConnection() {
        const channelId = this.getVoiceChannelId();
        if (this.voiceChannelId && channelId === null) {
            if (this.preview) this.preview.hidden = true;
            if (this.participantMenu) this.participantMenu.hidden = true;
        }
        this.voiceChannelId = channelId;
    }

    placeButton() {
        if (!this.button) return;
        const panel = document.querySelector('[aria-label="Статус и настройки пользователя"], [aria-label="User status and settings"], [aria-label="User area"], [class*="panels_"]');
        const disconnect = panel && [...panel.querySelectorAll('button, [role="button"]')]
            .find(node => node !== this.button && node.getClientRects().length && /^(?:отключиться|disconnect)$/i.test([node.getAttribute("aria-label"), node.getAttribute("title")].filter(Boolean).join(" ")));
        if (!panel || !disconnect) {
            this.button.remove();
            document.querySelector("#bd-voice-plugin-toolbar:empty")?.remove();
            return;
        }
        let toolbar = panel.querySelector(":scope > #bd-voice-plugin-toolbar");
        if (!toolbar) {
            toolbar = document.createElement("div");
            toolbar.id = "bd-voice-plugin-toolbar";
            Object.assign(toolbar.style, { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px", width: "100%", minHeight: "34px", padding: "2px 8px", background: "#111214", borderRadius: "12px 12px 0 0" });
            panel.insertBefore(toolbar, panel.firstChild);
        }
        if (this.button.parentElement !== toolbar) toolbar.append(this.button);
    }

    schedulePlacement() {
        if (this.placementTimer) return;
        this.placementTimer = setTimeout(() => { this.placementTimer = null; this.placeButton(); }, 300);
    }

    stop() {
        clearInterval(this.timer);
        clearTimeout(this.placementTimer);
        this.observer?.disconnect();
        try { this.server?.close(); } catch {}
        this.server = null;
        window.removeEventListener("bd-subtitle-received", this.onSubtitleEvent);
        this.preview?.remove();
        clearTimeout(this.participantRefreshTimer);
        this.participantMenu?.remove();
        this.button?.remove();
        document.querySelector("#bd-voice-plugin-toolbar:empty")?.remove();
        if (typeof BdApi !== "undefined") BdApi.DOM.removeStyle("Subtitles");
    }
};