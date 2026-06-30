// js/app.js  –  Main dashboard logic, fully wired to PHP backend

const App = {
    currentGroup: null,
    currentGroupId: null,
    replyingTo: null,
    editingMsgId: null,
    ctxTarget: null,
    _forwardTarget: null,

    async init() {
        if (!Auth.isLoggedIn()) { window.location.href = 'auth.html'; return; }
        this.renderCurrentUser();
        await this.loadGroups();
        this.bindNav();
        this.bindMessageInput();
        this.bindShareBar();
        this.bindModals();
        this.bindContextMenus();
        this.bindTabBar();
        this.loadNotificationBadge();
        setInterval(() => this.loadNotificationBadge(), 30000);
    },

    renderCurrentUser() {
        const user = Auth.getUser();
        if (!user) return;
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        document.querySelectorAll('.avatar[title="My Profile"]').forEach(el => {
            el.textContent = initials;
            el.title = user.name + ' (' + user.role + ')';
        });
        if (user.role !== 'admin') {
            document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
        }
    },

    async loadGroups() {
        const res = await GroupsAPI.list();
        if (!res?.success) { this.showToast('Could not load groups', 'ti-alert-circle'); return; }
        const list = document.getElementById('group-list');
        if (!list) return;
        list.innerHTML = '';
        const colors = [
            { bg: 'rgba(108,99,255,0.15)', fg: '#6c63ff' },
            { bg: 'rgba(67,217,173,0.12)', fg: '#43d9ad' },
            { bg: 'rgba(255,101,132,0.12)', fg: '#ff6584' },
            { bg: 'rgba(249,202,36,0.12)', fg: '#f9ca24' },
            { bg: 'rgba(162,155,254,0.12)', fg: '#a29bfe' },
        ];
        res.data.forEach((group, i) => {
            const c = colors[i % colors.length];
            const initials = group.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const el = document.createElement('div');
            el.className = 'group-item';
            el.dataset.groupId = group.id;
            el.innerHTML = `
                <div class="group-avatar" style="background:${c.bg};color:${c.fg}">${initials}</div>
                <div class="group-info">
                    <div class="group-name">${this.esc(group.name)}</div>
                    <div class="group-sub">${group.member_count} members</div>
                </div>`;
            el.addEventListener('click', () => this.selectGroup(group.id, group.name));
            list.appendChild(el);
        });
        if (res.data.length > 0) await this.selectGroup(res.data[0].id, res.data[0].name);
    },

    async selectGroup(groupId, groupName) {
        this.currentGroupId = groupId;
        this.currentGroup   = groupName;
        document.querySelectorAll('.group-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.group-item[data-group-id="${groupId}"]`)?.classList.add('active');
        const titleEl = document.getElementById('channel-title');
        if (titleEl) titleEl.textContent = groupName;
        const input = document.getElementById('msg-input');
        if (input) input.placeholder = `Message #${groupName.toLowerCase().replace(/ /g, '-')}…`;
        this.navigateTo('feed');
        document.querySelectorAll('.sidebar-item[data-page]').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-page="feed"]')?.classList.add('active');
        await Promise.all([this.loadArticles(), this.loadMessages(), this.loadGroupMembers()]);
    },

    bindNav() {
        document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigateTo(page);
                document.querySelectorAll('.sidebar-item[data-page]').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                if (page === 'notifications') this.loadNotifications();
                if (page === 'analytics')     this.loadAnalytics();
            });
        });
        document.getElementById('logout-btn')?.addEventListener('click', () => AuthAPI.logout());
    },

    navigateTo(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + page)?.classList.add('active');
    },

    async loadArticles() {
        if (!this.currentGroupId) return;
        const res = await ArticlesAPI.list(this.currentGroupId);
        if (!res?.success) return;
        const feed = document.getElementById('tab-articles');
        if (!feed) return;
        feed.innerHTML = '';
        if (res.data.length === 0) {
            feed.innerHTML = `<div class="empty-state"><i class="ti ti-newspaper"></i><p>No articles yet.<br>Paste a URL above to share the first one!</p></div>`;
            return;
        }
        res.data.forEach(article => feed.appendChild(this.buildArticleCard(article)));
    },

    buildArticleCard(article) {
        const user     = Auth.getUser();
        const isPinned = article.is_pinned == 1;
        const isFwd    = article.is_forwarded == 1;
        const initials = article.shared_by_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const time     = this.timeAgo(article.created_at);
        const reactEmojis = ['👍','❤️','😂','😮','🔥','👏'];
        const reactionsMap = {};
        (article.reactions || []).forEach(r => reactionsMap[r.reaction_type] = r.cnt);
        const reactHTML = reactEmojis.map(e => {
            const cnt = reactionsMap[e] || 0;
            const mine = article.my_reaction === e;
            if (cnt === 0 && !mine) return '';
            return `<div class="reaction-chip ${mine ? 'active' : ''}" data-emoji="${e}" data-article-id="${article.id}"><span>${e}</span><span class="rc">${cnt}</span></div>`;
        }).join('');
        const card = document.createElement('div');
        card.className = 'article-card' + (isPinned ? ' pinned' : '');
        card.dataset.articleId = article.id;
        card.innerHTML = `
            <div class="article-meta">
                <div class="avatar" style="width:26px;height:26px;font-size:10px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${initials}</div>
                <div><div class="article-author">${this.esc(article.shared_by_name)} <span class="tag tag-${article.shared_by_role==='admin'?'purple':'teal'}" style="margin-left:6px">${article.shared_by_role}</span></div></div>
                <span class="article-time">${time}</span>
                ${isPinned ? '<div class="pin-badge"><i class="ti ti-pin" style="font-size:11px"></i> Pinned</div>' : ''}
            </div>
            ${isFwd ? '<div style="padding:0 16px"><div class="forwarded-label"><i class="ti ti-corner-right-up"></i> Forwarded</div></div>' : ''}
            <a href="${this.esc(article.article_url)}" target="_blank" rel="noopener" class="article-preview" style="text-decoration:none">
                <div class="article-img">${article.thumbnail ? `<img src="${this.esc(article.thumbnail)}" alt="">` : '<div class="img-placeholder"><i class="ti ti-newspaper"></i></div>'}</div>
                <div class="article-body">
                    <div class="article-source">${this.esc(article.source_name || '')}</div>
                    <div class="article-title-text">${this.esc(article.article_title || article.article_url)}</div>
                    <div class="article-desc">${this.esc(article.description || '')}</div>
                </div>
            </a>
            <div class="article-actions">
                <div class="reactions">${reactHTML || '<span style="font-size:11px;color:var(--text-muted)">Be first to react</span>'}</div>
                <button class="action-btn react-btn"><i class="ti ti-mood-smile"></i></button>
                <button class="action-btn forward-article-btn"><i class="ti ti-share"></i> Forward</button>
                <button class="action-btn ctx-trigger" style="margin-left:auto"><i class="ti ti-dots"></i></button>
            </div>
            <div style="padding:0 16px 10px;font-size:11px;color:var(--text-muted)"><i class="ti ti-eye"></i> ${article.view_count || 0} views</div>`;
        card.querySelectorAll('.reaction-chip').forEach(chip => chip.addEventListener('click', () => this.toggleArticleReaction(chip, article.id)));
        card.querySelector('.react-btn').addEventListener('click', (e) => { e.stopPropagation(); this.showEmojiPickerFor(e.currentTarget, 'article', article.id); });
        card.querySelector('.forward-article-btn').addEventListener('click', () => this.openForwardModal('article', article.id));
        card.querySelector('.ctx-trigger').addEventListener('click', (e) => { e.stopPropagation(); this.ctxTarget = { type: 'article', id: article.id, ownerId: parseInt(article.shared_by) }; this.showCtxMenu(e); });
        card.querySelector('a').addEventListener('click', () => ArticlesAPI.recordView(article.id));
        return card;
    },

    async loadMessages() {
        if (!this.currentGroupId) return;
        const res = await MessagesAPI.list(this.currentGroupId);
        if (!res?.success) return;
        const feed = document.getElementById('msg-feed');
        if (!feed) return;
        feed.innerHTML = '';
        if (res.data.length === 0) {
            feed.innerHTML = `<div class="empty-state"><i class="ti ti-message-circle"></i><p>No messages yet. Say hello!</p></div>`;
            return;
        }
        let lastDate = '';
        res.data.forEach(msg => {
            const dateStr = new Date(msg.created_at).toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });
            if (dateStr !== lastDate) {
                const d = document.createElement('div');
                d.className = 'date-divider'; d.textContent = dateStr;
                feed.appendChild(d); lastDate = dateStr;
            }
            feed.appendChild(this.buildMessageCard(msg));
        });
        const panel = feed.closest('.center-panel');
        if (panel) panel.scrollTop = panel.scrollHeight;
        const latest = res.data[res.data.length - 1];
        if (latest) MessagesAPI.markSeen(latest.id);
    },

    buildMessageCard(msg) {
        const user      = Auth.getUser();
        const isMe      = msg.user_id == user.id;
        const initials  = msg.sender_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const time      = this.formatTime(msg.created_at);
        const isDeleted = msg.is_deleted == 1;
        const isEdited  = msg.is_edited  == 1;
        const isFwd     = msg.is_forwarded == 1;
        const reactHTML = (msg.reactions || []).map(r =>
            `<div class="reaction-chip" data-emoji="${r.reaction_type}" data-msg-id="${msg.id}"><span>${r.reaction_type}</span><span class="rc">${r.cnt}</span></div>`).join('');
        const el = document.createElement('div');
        el.className = 'msg-card';
        el.dataset.msgId = msg.id;
        el.innerHTML = `
            <div class="avatar" style="align-self:flex-start;margin-top:2px;background:linear-gradient(135deg,var(--accent),var(--accent2));font-size:10px">${initials}</div>
            <div class="msg-body">
                <div class="msg-header">
                    <span class="msg-sender" style="color:${isMe?'var(--accent3)':'var(--accent)'}">${this.esc(msg.sender_name)}</span>
                    <span class="msg-ts">${time}${isEdited&&!isDeleted?' <span style="color:var(--text-muted);font-size:10px">(edited)</span>':''}</span>
                </div>
                ${msg.reply_to && msg.reply_text ? `<div class="reply-preview"><div class="reply-author">${this.esc(msg.reply_sender_name||'')}</div><div class="reply-text">${this.esc(msg.reply_text)}</div></div>` : ''}
                ${isFwd ? '<div class="forwarded-label"><i class="ti ti-corner-right-up"></i> Forwarded</div>' : ''}
                <div class="msg-text" style="${isDeleted?'color:var(--text-muted);font-style:italic':''}">${this.esc(msg.message)}</div>
                ${reactHTML ? `<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${reactHTML}</div>` : ''}
                ${msg.seen_count > 0 ? `<div class="seen-status"><i class="ti ti-checks"></i> Seen by ${msg.seen_count}</div>` : ''}
            </div>
            ${!isDeleted ? `<div class="msg-actions">
                <button class="msg-action-btn react-msg-btn" title="React"><i class="ti ti-mood-smile"></i></button>
                <button class="msg-action-btn reply-btn" title="Reply"><i class="ti ti-arrow-back-up"></i></button>
                ${isMe||Auth.isAdmin() ? `<button class="msg-action-btn edit-btn" title="Edit"><i class="ti ti-edit"></i></button>` : ''}
                ${isMe||Auth.isAdmin() ? `<button class="msg-action-btn del-msg-btn" title="Delete"><i class="ti ti-trash"></i></button>` : ''}
            </div>` : ''}`;
        el.querySelectorAll('.reaction-chip').forEach(chip => chip.addEventListener('click', () => this.toggleMsgReaction(chip, msg.id)));
        el.querySelector('.react-msg-btn')?.addEventListener('click', (e) => { e.stopPropagation(); this.showEmojiPickerFor(e.currentTarget, 'message', msg.id); });
        el.querySelector('.reply-btn')?.addEventListener('click', () => { this.replyingTo = { id: msg.id, text: msg.message, sender: msg.sender_name }; this.showReplyBar(); });
        el.querySelector('.edit-btn')?.addEventListener('click', () => { this.editingMsgId = msg.id; const inp = document.getElementById('msg-input'); if (inp) { inp.value = msg.message; inp.focus(); } this.showToast('Editing message – press Enter to save', 'ti-edit'); });
        el.querySelector('.del-msg-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete this message?')) return;
            const r = await MessagesAPI.delete(msg.id);
            if (r?.success) { this.showToast('Deleted', 'ti-check'); await this.loadMessages(); }
            else this.showToast(r?.message || 'Failed', 'ti-alert-circle');
        });
        return el;
    },

    async loadGroupMembers() {
        if (!this.currentGroupId) return;
        const res = await GroupsAPI.members(this.currentGroupId);
        if (!res?.success) return;
        const container = document.getElementById('members-list');
        if (!container) return;
        container.innerHTML = '';
        res.data.forEach(member => {
            const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const isOnline = member.last_seen && (Date.now() - new Date(member.last_seen).getTime()) < 5 * 60 * 1000;
            const el = document.createElement('div');
            el.className = 'member-row';
            el.innerHTML = `
                <div class="avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent2));width:28px;height:28px;font-size:10px">${initials}</div>
                <div style="flex:1"><div class="member-name">${this.esc(member.name)}</div><div class="member-role">${member.role}</div></div>
                <div class="${isOnline ? 'online-dot' : 'offline-dot'}"></div>`;
            container.appendChild(el);
        });
    },

    bindMessageInput() {
        const textarea = document.getElementById('msg-input');
        if (!textarea) return;
        textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await this.sendOrEditMessage(); }
            if (e.key === 'Escape') { this.replyingTo = null; this.editingMsgId = null; this.hideReplyBar(); textarea.value = ''; }
        });
        textarea.addEventListener('input', () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'; });
        document.getElementById('send-btn')?.addEventListener('click', () => this.sendOrEditMessage());
    },

    async sendOrEditMessage() {
        const textarea = document.getElementById('msg-input');
        const text = textarea?.value.trim();
        if (!text || !this.currentGroupId) return;
        if (this.editingMsgId) {
            const res = await MessagesAPI.edit(this.editingMsgId, text);
            if (res?.success) { this.showToast('Message updated', 'ti-check'); await this.loadMessages(); }
            else this.showToast(res?.message || 'Edit failed', 'ti-alert-circle');
            this.editingMsgId = null;
        } else {
            const res = await MessagesAPI.send(this.currentGroupId, text, this.replyingTo?.id || null);
            if (res?.success) { await this.loadMessages(); }
            else this.showToast(res?.message || 'Send failed', 'ti-alert-circle');
            this.replyingTo = null; this.hideReplyBar();
        }
        if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }
    },

    showReplyBar() {
        let bar = document.getElementById('reply-bar');
        if (!bar) { bar = document.createElement('div'); bar.id = 'reply-bar'; bar.style.cssText = 'background:var(--bg-card);border-top:1px solid var(--border);padding:8px 20px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-secondary);flex-shrink:0'; document.querySelector('.message-input-bar')?.before(bar); }
        bar.innerHTML = `<i class="ti ti-arrow-back-up" style="color:var(--accent)"></i> Replying to <strong style="margin:0 4px">${this.esc(this.replyingTo?.sender)}</strong>: ${this.esc((this.replyingTo?.text||'').slice(0,60))}… <button onclick="App.replyingTo=null;App.hideReplyBar()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;line-height:1">×</button>`;
        document.getElementById('msg-input')?.focus();
    },

    hideReplyBar() { document.getElementById('reply-bar')?.remove(); },

    bindShareBar() {
        const input = document.getElementById('article-url-input');
        const btn   = document.getElementById('share-article-btn');
        if (!input || !btn) return;
        input.addEventListener('paste', () => setTimeout(() => this.previewOg(input.value.trim()), 200));
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.shareArticle(input.value.trim()); });
        btn.addEventListener('click', () => this.shareArticle(input.value.trim()));
    },

    async previewOg(url) {
        if (!url || !url.startsWith('http')) return;
        const preview = document.getElementById('og-preview');
        if (!preview) return;
        preview.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">Fetching preview…</span>';
        preview.style.display = 'flex';
        const res = await ArticlesAPI.fetchOg(url);
        if (res?.success && res.data?.title) {
            preview.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start;background:var(--bg-hover);padding:10px;border-radius:8px;border:1px solid var(--border);width:100%">${res.data.image ? `<img src="${this.esc(res.data.image)}" style="width:60px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0">` : ''}<div style="min-width:0"><div style="font-size:11px;color:var(--accent);font-weight:600">${this.esc(res.data.source||'')}</div><div style="font-size:12.5px;font-weight:500;margin-top:2px">${this.esc(res.data.title)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${this.esc(res.data.description||'')}</div></div></div>`;
        } else { preview.innerHTML = ''; preview.style.display = 'none'; }
    },

    async shareArticle(url) {
        if (!url) return;
        if (!url.startsWith('http')) { this.showToast('Enter a valid URL starting with http', 'ti-alert-circle'); return; }
        if (!this.currentGroupId)    { this.showToast('Select a group first', 'ti-alert-circle'); return; }
        const btn = document.getElementById('share-article-btn');
        if (btn) { btn.textContent = 'Sharing…'; btn.disabled = true; }
        const res = await ArticlesAPI.share(this.currentGroupId, url);
        if (btn) { btn.textContent = 'Share'; btn.disabled = false; }
        if (res?.success) {
            document.getElementById('article-url-input').value = '';
            const ogp = document.getElementById('og-preview');
            if (ogp) { ogp.innerHTML = ''; ogp.style.display = 'none'; }
            this.showToast('Article shared!', 'ti-check');
            await this.loadArticles();
        } else this.showToast(res?.message || 'Failed to share', 'ti-alert-circle');
    },

    async toggleArticleReaction(chip, articleId) {
        const res = await ReactionsAPI.toggle('article', articleId, chip.dataset.emoji);
        if (res?.success) await this.loadArticles();
    },

    async toggleMsgReaction(chip, msgId) {
        const res = await ReactionsAPI.toggle('message', msgId, chip.dataset.emoji);
        if (res?.success) await this.loadMessages();
    },

    showEmojiPickerFor(btn, targetType, targetId) {
        const picker = document.getElementById('emoji-picker');
        if (!picker) return;
        picker.dataset.targetType = targetType; picker.dataset.targetId = targetId;
        const rect = btn.getBoundingClientRect();
        picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px'; picker.style.left = rect.left + 'px';
        picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex';
    },

    async pickEmoji(emoji) {
        const picker = document.getElementById('emoji-picker');
        const targetType = picker?.dataset.targetType; const targetId = parseInt(picker?.dataset.targetId);
        if (!targetType || !targetId) return;
        if (picker) picker.style.display = 'none';
        const res = await ReactionsAPI.toggle(targetType, targetId, emoji);
        if (res?.success) { if (targetType === 'article') await this.loadArticles(); else await this.loadMessages(); }
    },

    async loadNotificationBadge() {
        const res = await NotificationsAPI.unreadCount();
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const cnt = res?.data?.cnt || 0;
        badge.textContent = cnt; badge.style.display = cnt > 0 ? 'inline-flex' : 'none';
    },

    async loadNotifications() {
        const res = await NotificationsAPI.list();
        if (!res?.success) return;
        const feed = document.getElementById('notifications-feed');
        if (!feed) return; feed.innerHTML = '';
        if (res.data.length === 0) { feed.innerHTML = `<div class="empty-state"><i class="ti ti-bell-off"></i><p>No notifications yet</p></div>`; return; }
        const iconMap = { reply:{icon:'ti-arrow-back-up',bg:'var(--accent-soft)',fg:'var(--accent)'}, pin:{icon:'ti-pin',bg:'rgba(255,101,132,0.12)',fg:'var(--accent2)'}, group_invite:{icon:'ti-users',bg:'rgba(67,217,173,0.12)',fg:'var(--accent3)'}, reaction:{icon:'ti-mood-smile',bg:'var(--accent-soft)',fg:'var(--accent)'}, article_shared:{icon:'ti-newspaper',bg:'rgba(249,202,36,0.1)',fg:'#f9ca24'}, new_message:{icon:'ti-message-circle',bg:'rgba(108,99,255,0.12)',fg:'var(--accent)'} };
        res.data.forEach(n => {
            const cfg = iconMap[n.notification_type] || { icon:'ti-bell', bg:'var(--bg-hover)', fg:'var(--text-muted)' };
            const el = document.createElement('div');
            el.className = 'notif-item' + (n.is_read==0?' unread':'');
            el.innerHTML = `<div class="notif-icon" style="background:${cfg.bg};color:${cfg.fg}"><i class="ti ${cfg.icon}"></i></div><div class="notif-text">${this.esc(n.message)}<div class="notif-time">${this.timeAgo(n.created_at)}</div></div>`;
            el.addEventListener('click', async () => { el.classList.remove('unread'); await NotificationsAPI.markRead(n.id); this.loadNotificationBadge(); });
            feed.appendChild(el);
        });
    },

    async loadAnalytics() {
        const [overview, groups, articles] = await Promise.all([AnalyticsAPI.overview(), AnalyticsAPI.activeGroups(), AnalyticsAPI.topArticles()]);
        if (overview?.success) {
            const d = overview.data;
            [['stat-views',d.total_views],['stat-articles',d.articles_this_month],['stat-messages',d.messages_this_month],['stat-users',d.active_users]].forEach(([id,v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
        }
        if (groups?.success) {
            const container = document.getElementById('groups-chart'); if (!container) return;
            container.innerHTML = '';
            const max = groups.data[0]?.activity_score || 1;
            groups.data.forEach(g => {
                const pct = Math.round((g.activity_score / max) * 100);
                container.innerHTML += `<div class="bar-row"><span class="bar-label" style="min-width:120px">${this.esc(g.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div></div><span class="bar-val">${g.activity_score}</span></div>`;
            });
        }
        if (articles?.success) {
            const container = document.getElementById('top-articles-list'); if (!container) return;
            container.innerHTML = '';
            articles.data.slice(0,5).forEach((a,i) => {
                container.innerHTML += `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)"><span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--accent);min-width:24px">${i+1}</span><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.esc(a.article_title||a.article_url)}</div><div style="font-size:11px;color:var(--text-muted)">${this.esc(a.source_name||'')} · ${a.view_count} views</div></div></div>`;
            });
        }
    },

    bindModals() {
        document.getElementById('create-group-btn')?.addEventListener('click', async () => {
            if (!Auth.isAdmin()) { this.showToast('Only admins can create groups', 'ti-lock'); return; }
            const res = await UsersAPI.list();
            if (res?.success) {
                const container = document.getElementById('member-select-list'); if (!container) return;
                container.innerHTML = '';
                res.data.forEach(u => {
                    const li = document.createElement('label');
                    li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:13px;color:var(--text-secondary)';
                    li.innerHTML = `<input type="checkbox" value="${u.id}" style="accent-color:var(--accent)"> ${this.esc(u.name)} <span style="color:var(--text-muted);font-size:11px">(${u.role})</span>`;
                    container.appendChild(li);
                });
            }
            this.openModal('modal-create-group');
        });
        document.getElementById('create-group-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('group-name-input')?.value.trim();
            const desc = document.getElementById('group-desc-input')?.value.trim();
            const memberIds = Array.from(document.querySelectorAll('#member-select-list input:checked')).map(i => parseInt(i.value));
            if (!name) return;
            const res = await GroupsAPI.create({ name, description: desc, member_ids: memberIds });
            if (res?.success) { this.closeAllModals(); this.showToast(`Group "${name}" created!`, 'ti-check'); await this.loadGroups(); }
            else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
        });
        document.querySelectorAll('[data-modal]').forEach(el => el.addEventListener('click', () => this.openModal(el.dataset.modal)));
        document.querySelectorAll('.modal-close, [data-close-modal]').forEach(el => el.addEventListener('click', () => this.closeAllModals()));
        document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) this.closeAllModals(); }));
        document.getElementById('forward-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupIds = Array.from(document.querySelectorAll('#forward-group-list input:checked')).map(i => parseInt(i.value));
            if (!groupIds.length) { this.showToast('Select at least one group', 'ti-alert-circle'); return; }
            const fwd = this._forwardTarget;
            const res = fwd?.type === 'article' ? await ArticlesAPI.forward(fwd.id, groupIds) : await MessagesAPI.forward(fwd.id, groupIds);
            if (res?.success) { this.closeAllModals(); this.showToast('Forwarded!', 'ti-check'); }
            else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
        });
    },

    async openForwardModal(type, id) {
        this._forwardTarget = { type, id };
        const res = await GroupsAPI.list();
        const container = document.getElementById('forward-group-list');
        if (container && res?.success) {
            container.innerHTML = '';
            res.data.forEach(g => {
                if (g.id === this.currentGroupId) return;
                const li = document.createElement('label');
                li.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);color:var(--text-secondary);margin-bottom:8px';
                li.innerHTML = `<input type="checkbox" value="${g.id}" style="accent-color:var(--accent)"> ${this.esc(g.name)}`;
                container.appendChild(li);
            });
        }
        this.openModal('modal-forward');
    },

    openModal(id)    { document.getElementById(id)?.classList.add('open'); },
    closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); },

    bindContextMenus() {
        document.addEventListener('click', e => {
            if (!e.target.closest('#ctx-menu'))  document.getElementById('ctx-menu')?.classList.remove('open');
            if (!e.target.closest('#emoji-picker') && !e.target.closest('.react-btn,.react-msg-btn')) document.getElementById('emoji-picker').style.display = 'none';
        });
    },

    showCtxMenu(e) {
        const menu = document.getElementById('ctx-menu'); if (!menu) return;
        const user = Auth.getUser(); const isOwner = this.ctxTarget?.ownerId === user?.id;
        menu.innerHTML = '';
        if (Auth.isAdmin() && this.ctxTarget?.type === 'article') menu.innerHTML += `<div class="ctx-item" onclick="App.ctxPin()"><i class="ti ti-pin"></i> Pin / Unpin</div>`;
        menu.innerHTML += `<div class="ctx-item" onclick="App.ctxForward()"><i class="ti ti-share"></i> Forward</div>`;
        menu.innerHTML += `<div class="ctx-item" onclick="App.ctxCopy()"><i class="ti ti-copy"></i> Copy link</div>`;
        if (isOwner || Auth.isAdmin()) menu.innerHTML += `<div class="divider" style="margin:4px 0"></div><div class="ctx-item danger" onclick="App.ctxDelete()"><i class="ti ti-trash"></i> Delete</div>`;
        menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
        menu.style.top  = Math.min(e.clientY, window.innerHeight - 160) + 'px';
        menu.classList.add('open');
    },

    async ctxPin() {
        document.getElementById('ctx-menu')?.classList.remove('open');
        if (!this.ctxTarget) return;
        const id = this.ctxTarget.id;
        const articles = await ArticlesAPI.list(this.currentGroupId);
        const article  = articles?.data?.find(a => a.id == id);
        const res = article?.is_pinned == 1 ? await ArticlesAPI.unpin(id) : await ArticlesAPI.pin(id);
        if (res?.success) { this.showToast(article?.is_pinned == 1 ? 'Unpinned' : 'Pinned!', 'ti-check'); await this.loadArticles(); }
        else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
    },

    ctxForward() { document.getElementById('ctx-menu')?.classList.remove('open'); if (this.ctxTarget) this.openForwardModal(this.ctxTarget.type, this.ctxTarget.id); },

    ctxCopy() { document.getElementById('ctx-menu')?.classList.remove('open'); navigator.clipboard?.writeText(window.location.href).then(() => this.showToast('Copied!', 'ti-copy')); },

    async ctxDelete() {
        document.getElementById('ctx-menu')?.classList.remove('open');
        if (!this.ctxTarget || !confirm('Delete this item?')) return;
        const res = this.ctxTarget.type === 'article' ? await ArticlesAPI.delete(this.ctxTarget.id) : await MessagesAPI.delete(this.ctxTarget.id);
        if (res?.success) { this.showToast('Deleted', 'ti-check'); this.ctxTarget.type === 'article' ? await this.loadArticles() : await this.loadMessages(); }
        else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
    },

    bindTabBar() {
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                tab.closest('.tab-bar').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                tab.closest('.page')?.querySelectorAll('.tab-panel').forEach(p => { p.style.display = p.id === tab.dataset.tab ? '' : 'none'; });
            });
        });
    },

    showToast(msg, icon = 'ti-info-circle') {
        const container = document.getElementById('toast-container'); if (!container) return;
        const toast = document.createElement('div'); toast.className = 'toast';
        toast.innerHTML = `<i class="ti ${icon}"></i> ${msg}`; container.appendChild(toast);
        setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(()=>toast.remove(),300); }, 2500);
    },

    esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
    timeAgo(dateStr) { const d=Math.floor((Date.now()-new Date(dateStr).getTime())/1000); if(d<60) return 'just now'; if(d<3600) return Math.floor(d/60)+'m ago'; if(d<86400) return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; },
    formatTime(dateStr) { return new Date(dateStr).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); },
};

document.addEventListener('DOMContentLoaded', () => App.init());