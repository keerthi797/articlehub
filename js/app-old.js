// js/app.js – Complete ArticleHub

const App = {
    currentGroupId:   null,
    currentGroupName: null,
    replyingTo:       null,
    editingMsgId:     null,
    ctxTarget:        null,
    _forwardTarget:   null,
    _inviteSelectedUser: null,
    _currentMembers:  [],

    // ─────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────
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
        this.bindThemeToggle();
        setInterval(() => this.loadNotificationBadge(), 15000);
    },

    renderCurrentUser() {
        const user = Auth.getUser();
        if (!user) return;
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        document.querySelectorAll('.avatar[title="My Profile"]').forEach(el => {
            el.textContent = initials;
        });
    },

    // ─────────────────────────────────────────
    // GROUPS
    // ─────────────────────────────────────────
    async loadGroups() {
        const res = await GroupsAPI.list();
        if (!res?.success) {
            this.showToast('Could not load groups – check DB', 'ti-alert-circle');
            return;
        }
        const list = document.getElementById('group-list');
        if (!list) return;
        list.innerHTML = '';
        const colors = [
            { bg:'rgba(108,99,255,0.15)', fg:'#6c63ff' },
            { bg:'rgba(67,217,173,0.12)',  fg:'#43d9ad' },
            { bg:'rgba(255,101,132,0.12)', fg:'#ff6584' },
            { bg:'rgba(249,202,36,0.12)',  fg:'#f9ca24' },
            { bg:'rgba(162,155,254,0.12)', fg:'#a29bfe' },
        ];
        if (res.data.length === 0) {
            list.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--text-muted)">No groups yet. Create one!</div>`;
            return;
        }
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
                    <div class="group-sub">${group.member_count} member${group.member_count!=1?'s':''}</div>
                </div>`;
            el.addEventListener('click', () => this.selectGroup(group.id, group.name));
            list.appendChild(el);
        });
        if (res.data.length > 0) await this.selectGroup(res.data[0].id, res.data[0].name);
    },

    async selectGroup(groupId, groupName) {
        this.currentGroupId   = groupId;
        this.currentGroupName = groupName;
        document.querySelectorAll('.group-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.group-item[data-group-id="${groupId}"]`)?.classList.add('active');
        document.getElementById('channel-title').textContent = groupName;
        const input = document.getElementById('msg-input');
        if (input) input.placeholder = `Message #${groupName.toLowerCase().replace(/ /g,'-')}…`;
        this.navigateTo('feed');
        document.querySelectorAll('.sidebar-item[data-page]').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-page="feed"]')?.classList.add('active');
        document.querySelector('.tab[data-tab="tab-articles"]')?.click();
        await Promise.all([
            this.loadArticles(),
            this.loadMessages(),
            this.loadRightPanelMembers(),
        ]);
    },

    // ─────────────────────────────────────────
    // NAVIGATION
    // ─────────────────────────────────────────
    bindNav() {
        document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigateTo(page);
                document.querySelectorAll('.sidebar-item[data-page]').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                if (page === 'notifications') this.loadNotifications();
                if (page === 'analytics')     this.loadAnalytics();
                if (page === 'search')        this.initSearch();
            });
        });
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) AuthAPI.logout();
        });
    },

    navigateTo(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + page)?.classList.add('active');
    },




    // ─────────────────────────────────────────
    // ARTICLES
    // ─────────────────────────────────────────
    async loadArticles() {
        if (!this.currentGroupId) return;
        const res = await ArticlesAPI.list(this.currentGroupId);
        if (!res?.success) { this.showToast('Could not load articles', 'ti-alert-circle'); return; }
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
        const isPinned = article.is_pinned == 1;
        const isFwd    = article.is_forwarded == 1;
        const initials = article.shared_by_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const time     = this.timeAgo(article.created_at);

        const reactEmojis = ['👍','❤️','😂','😮','🔥','👏'];
        const reactionsMap = {};
        (article.reactions || []).forEach(r => reactionsMap[r.reaction_type] = parseInt(r.cnt));
        const reactHTML = reactEmojis.map(e => {
            const cnt  = reactionsMap[e] || 0;
            const mine = article.my_reaction === e;
            if (cnt === 0 && !mine) return '';
            return `<div class="reaction-chip ${mine?'active':''}" data-emoji="${e}" data-article-id="${article.id}">
                <span>${e}</span><span class="rc">${cnt}</span>
            </div>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'article-card' + (isPinned ? ' pinned' : '');
        card.dataset.articleId = article.id;
        card.innerHTML = `
            <div class="article-meta">
                <div class="avatar" style="width:26px;height:26px;font-size:10px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${initials}</div>
                <div>
                    <div class="article-author">${this.esc(article.shared_by_name)}
                        <span class="tag tag-${article.shared_by_role==='admin'?'purple':'teal'}" style="margin-left:6px">${article.shared_by_role}</span>
                    </div>
                </div>
                <span class="article-time">${time}</span>
                ${isPinned ? '<div class="pin-badge"><i class="ti ti-pin" style="font-size:11px"></i> Pinned</div>' : ''}
            </div>
            ${isFwd ? '<div style="padding:0 16px 4px"><div class="forwarded-label"><i class="ti ti-corner-right-up"></i> Forwarded</div></div>' : ''}
            <a href="${this.esc(article.article_url)}" target="_blank" rel="noopener" class="article-preview" style="text-decoration:none">
                <div class="article-img">
                    ${article.thumbnail
                        ? `<img src="${this.esc(article.thumbnail)}" alt="" onerror="this.parentElement.innerHTML='<div class=img-placeholder><i class=ti ti-newspaper></i></div>'">`
                        : '<div class="img-placeholder"><i class="ti ti-newspaper"></i></div>'}
                </div>
                <div class="article-body">
                    <div class="article-source">${this.esc(article.source_name || '')}</div>
                    <div class="article-title-text">${this.esc(article.article_title || article.article_url)}</div>
                    <div class="article-desc">${this.esc(article.description || '')}</div>
                </div>
            </a>
            <div class="article-actions">
                <div class="reactions">${reactHTML || '<span style="font-size:11px;color:var(--text-muted)">No reactions yet</span>'}</div>
                <button class="action-btn react-btn" title="React"><i class="ti ti-mood-smile"></i></button>
                <button class="action-btn forward-article-btn"><i class="ti ti-share"></i> Forward</button>
                <button class="action-btn ctx-trigger" style="margin-left:auto"><i class="ti ti-dots"></i></button>
            </div>
            <div style="padding:0 16px 10px;font-size:11px;color:var(--text-muted)">
                <i class="ti ti-eye"></i> ${article.view_count || 0} views
            </div>`;

        card.querySelectorAll('.reaction-chip').forEach(chip =>
            chip.addEventListener('click', () => this.toggleArticleReaction(chip, article.id)));
        card.querySelector('.react-btn').addEventListener('click', e => {
            e.stopPropagation();
            this.showEmojiPickerFor(e.currentTarget, 'article', article.id);
        });
        card.querySelector('.forward-article-btn').addEventListener('click', () =>
            this.openForwardModal('article', article.id));
        card.querySelector('.ctx-trigger').addEventListener('click', e => {
            e.stopPropagation();
            this.ctxTarget = { type:'article', id:article.id, ownerId:parseInt(article.shared_by) };
            this.showCtxMenu(e);
        });
        card.querySelector('a').addEventListener('click', () => ArticlesAPI.recordView(article.id));
        return card;
    },

    // ─────────────────────────────────────────
    // MESSAGES
    // ─────────────────────────────────────────
  async loadMessages() {
    const prevCount = document.getElementById('msg-feed')?.children.length || 0;

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
        const dateStr = new Date(msg.created_at).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
        if (dateStr !== lastDate) {
            const d = document.createElement('div');
            d.className = 'date-divider';
            d.textContent = dateStr;
            feed.appendChild(d);
            lastDate = dateStr;
        }
        feed.appendChild(this.buildMessageCard(msg));
    });

    // Play sound if new messages arrived
    const newCount = feed.children.length;
    if (prevCount > 0 && newCount > prevCount) {
        this.playNotificationSound();
    }

    // Scroll to bottom only if chat tab is visible
    setTimeout(() => {
        const chatPanel = document.getElementById('tab-chat');
        if (chatPanel && chatPanel.style.display !== 'none') {
            chatPanel.scrollTop = chatPanel.scrollHeight;
        }
    }, 50);

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

        const reactHTML = (msg.reactions || []).filter(r => r.cnt > 0).map(r =>
            `<div class="reaction-chip" data-emoji="${r.reaction_type}" data-msg-id="${msg.id}">
                <span>${r.reaction_type}</span><span class="rc">${r.cnt}</span>
            </div>`).join('');

        const el = document.createElement('div');
        el.className = 'msg-card';
        el.dataset.msgId = msg.id;
        el.innerHTML = `
            <div class="avatar" style="align-self:flex-start;margin-top:2px;background:linear-gradient(135deg,${isMe?'var(--accent3),#0984e3':'var(--accent),var(--accent2)'});font-size:10px">${initials}</div>
            <div class="msg-body">
                <div class="msg-header">
                    <span class="msg-sender" style="color:${isMe?'var(--accent3)':'var(--accent)'}">${this.esc(msg.sender_name)}</span>
                    <span class="msg-ts">${time}${isEdited&&!isDeleted?' <span style="color:var(--text-muted);font-size:10px">(edited)</span>':''}</span>
                </div>
                ${msg.reply_to && msg.reply_text ? `
                <div class="reply-preview">
                    <div class="reply-author">${this.esc(msg.reply_sender_name||'')}</div>
                    <div class="reply-text">${this.esc(msg.reply_text)}</div>
                </div>` : ''}
                ${isFwd ? '<div class="forwarded-label"><i class="ti ti-corner-right-up"></i> Forwarded</div>' : ''}
                <div class="msg-text" style="${isDeleted?'color:var(--text-muted);font-style:italic':''}">${this.esc(msg.message)}</div>
                ${reactHTML ? `<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${reactHTML}</div>` : ''}
                ${msg.seen_count > 0 ? `<div class="seen-status"><i class="ti ti-checks"></i> Seen by ${msg.seen_count}</div>` : ''}
            </div>
            ${!isDeleted ? `
            <div class="msg-actions">
                <button class="msg-action-btn react-msg-btn" title="React"><i class="ti ti-mood-smile"></i></button>
                <button class="msg-action-btn reply-btn" title="Reply"><i class="ti ti-arrow-back-up"></i></button>
                <button class="msg-action-btn forward-msg-btn" title="Forward"><i class="ti ti-corner-right-up"></i></button>
                ${isMe||Auth.isAdmin() ? `<button class="msg-action-btn edit-btn" title="Edit"><i class="ti ti-edit"></i></button>` : ''}
                ${isMe||Auth.isAdmin() ? `<button class="msg-action-btn del-msg-btn" title="Delete"><i class="ti ti-trash"></i></button>` : ''}
            </div>` : ''}`;

        el.querySelectorAll('.reaction-chip').forEach(chip =>
            chip.addEventListener('click', () => this.toggleMsgReaction(chip, msg.id)));
        el.querySelector('.react-msg-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            this.showEmojiPickerFor(e.currentTarget, 'message', msg.id);
        });
        el.querySelector('.reply-btn')?.addEventListener('click', () => {
            this.replyingTo = { id:msg.id, text:msg.message, sender:msg.sender_name };
            this.showReplyBar();
        });
        el.querySelector('.forward-msg-btn')?.addEventListener('click', () =>
            this.openForwardModal('message', msg.id));
        el.querySelector('.edit-btn')?.addEventListener('click', () => {
            this.editingMsgId = msg.id;
            const inp = document.getElementById('msg-input');
            if (inp) { inp.value = msg.message; inp.focus(); }
            this.showToast('Editing – press Enter to save, Esc to cancel', 'ti-edit');
        });
        el.querySelector('.del-msg-btn')?.addEventListener('click', async () => {
            if (!confirm('Delete this message?')) return;
            const r = await MessagesAPI.delete(msg.id);
            if (r?.success) { this.showToast('Message deleted', 'ti-check'); await this.loadMessages(); }
            else this.showToast(r?.message||'Failed', 'ti-alert-circle');
        });
        return el;
    },

    // ─────────────────────────────────────────
    // RIGHT PANEL MEMBERS
    // ─────────────────────────────────────────
    async loadRightPanelMembers() {
        if (!this.currentGroupId) return;
        const res = await GroupsAPI.members(this.currentGroupId);
        if (!res?.success) return;
        this._currentMembers = res.data;
        const container = document.getElementById('members-list');
        if (!container) return;
        container.innerHTML = '';
        res.data.forEach(member => {
            const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const isOnline = member.last_seen && (Date.now()-new Date(member.last_seen).getTime()) < 5*60*1000;
            const el = document.createElement('div');
            el.className = 'member-row';
            el.innerHTML = `
                <div class="avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent2));width:28px;height:28px;font-size:10px">${initials}</div>
                <div style="flex:1">
                    <div class="member-name">${this.esc(member.name)}</div>
                    <div class="member-role">${member.role}</div>
                </div>
                <div class="${isOnline?'online-dot':'offline-dot'}" title="${isOnline?'Online':'Offline'}"></div>`;
            container.appendChild(el);
        });

        // Update "View all X members" button
        const viewBtn = document.querySelector('[data-modal="modal-members"]');
        if (viewBtn) viewBtn.innerHTML = `<i class="ti ti-users"></i> Manage ${res.data.length} members`;
    },

    // ─────────────────────────────────────────
    // MANAGE MEMBERS MODAL (Add / Remove)
    // ─────────────────────────────────────────
    async openMembersModal() {
        if (!this.currentGroupId) { this.showToast('Select a group first', 'ti-alert-circle'); return; }

        // Update title
        const titleEl = document.getElementById('members-modal-title');
        if (titleEl) titleEl.textContent = `Manage Members – ${this.currentGroupName}`;

        // Show Add Member section only for admin
        const addSection = document.getElementById('add-member-section');
        if (addSection) addSection.style.display = Auth.isAdmin() ? 'block' : 'none';

        await this.refreshMembersModalList();
        this.openModal('modal-members');
    },

    async refreshMembersModalList() {
        const res = await GroupsAPI.members(this.currentGroupId);
        if (!res?.success) return;
        this._currentMembers = res.data;

        const container = document.getElementById('modal-members-list');
        if (!container) return;
        container.innerHTML = '';

        res.data.forEach(member => {
            const initials = member.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const isOnline = member.last_seen && (Date.now()-new Date(member.last_seen).getTime()) < 5*60*1000;
            const isMe     = member.id == Auth.getUser()?.id;

            const el = document.createElement('div');
            el.className = 'member-modal-row';
            el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)';
            el.innerHTML = `
                <div class="avatar" style="width:34px;height:34px;font-size:12px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${initials}</div>
                <div style="flex:1">
                    <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px">
                        ${this.esc(member.name)}
                        ${isMe ? '<span style="font-size:10px;color:var(--text-muted)">(you)</span>' : ''}
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${this.esc(member.email||'')} · <span class="tag tag-${member.role==='admin'?'purple':'teal'}" style="padding:1px 6px">${member.role}</span></div>
                </div>
                <div class="${isOnline?'online-dot':'offline-dot'}" title="${isOnline?'Online':'Offline'}" style="flex-shrink:0"></div>
                ${Auth.isAdmin() && !isMe ? `
                <button class="remove-member-btn" data-uid="${member.id}" data-name="${this.esc(member.name)}"
                    style="background:rgba(255,101,132,0.1);border:1px solid rgba(255,101,132,0.3);color:var(--accent2);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap">
                    <i class="ti ti-user-minus"></i> Remove
                </button>` : ''}`;

            el.querySelector('.remove-member-btn')?.addEventListener('click', async (e) => {
                const uid  = parseInt(e.currentTarget.dataset.uid);
                const name = e.currentTarget.dataset.name;
                await this.removeMember(uid, name);
            });
            container.appendChild(el);
        });

        if (res.data.length === 0) {
            container.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:12px 0">No members in this group yet.</div>`;
        }
    },

    async removeMember(userId, name) {
        if (!confirm(`Remove "${name}" from this group?`)) return;
        const res = await GroupsAPI.removeMember(this.currentGroupId, userId);
        if (res?.success) {
            this.showToast(`${name} removed from group`, 'ti-check');
            await this.refreshMembersModalList();
            await this.loadRightPanelMembers();
        } else {
            this.showToast(res?.message || 'Failed to remove member', 'ti-alert-circle');
        }
    },

    // Search users to invite
    async searchUsersToInvite(q) {
        const resultsBox = document.getElementById('invite-search-results');
        if (!resultsBox) return;
        if (!q || q.length < 2) { resultsBox.style.display = 'none'; return; }

        resultsBox.style.display = 'block';
        resultsBox.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">Searching…</div>';

        const res = await UsersAPI.list(q);
        if (!res?.success) return;

        // Filter out people already in the group
        const memberIds = this._currentMembers.map(m => parseInt(m.id));
        const available = res.data.filter(u => !memberIds.includes(parseInt(u.id)));

        resultsBox.innerHTML = '';
        if (available.length === 0) {
            resultsBox.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No users found or all already members</div>';
            return;
        }

        available.slice(0, 6).forEach(u => {
            const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s';
            el.onmouseover = () => el.style.background = 'var(--bg-hover)';
            el.onmouseout  = () => el.style.background = '';
            el.innerHTML = `
                <div class="avatar" style="width:28px;height:28px;font-size:10px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${initials}</div>
                <div style="flex:1">
                    <div style="font-size:13px;font-weight:500">${this.esc(u.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${this.esc(u.email)} · ${u.role}</div>
                </div>
                <span style="font-size:11px;color:var(--accent);font-weight:600">Select</span>`;
            el.addEventListener('click', () => {
                this._inviteSelectedUser = u;
                document.getElementById('invite-user-search').value = u.name + ' (' + u.email + ')';
                resultsBox.style.display = 'none';
                document.getElementById('confirm-add-btn').style.display = 'flex';
            });
            resultsBox.appendChild(el);
        });
    },

    async confirmAddMember() {
        const u = this._inviteSelectedUser;
        if (!u) { this.showToast('Please search and select a user first', 'ti-alert-circle'); return; }

        const btn = document.getElementById('confirm-add-btn');
        if (btn) { btn.textContent = 'Adding…'; btn.disabled = true; }

        const res = await GroupsAPI.addMember(this.currentGroupId, u.id);

        if (btn) { btn.innerHTML = '<i class="ti ti-user-plus"></i> Add to Group'; btn.disabled = false; }

        if (res?.success) {
            this.showToast(`${u.name} added to ${this.currentGroupName}!`, 'ti-check');
            this._inviteSelectedUser = null;
            document.getElementById('invite-user-search').value = '';
            btn.style.display = 'none';
            await this.refreshMembersModalList();
            await this.loadRightPanelMembers();
        } else {
            this.showToast(res?.message || 'Failed to add member', 'ti-alert-circle');
        }
    },


    toggleAddMember() {
        const section = document.getElementById('add-member-section');
        const btn     = document.getElementById('toggle-add-member-btn');
        if (!section) return;
        const isVisible = section.style.display !== 'none';
        section.style.display = isVisible ? 'none' : 'block';
        if (btn) btn.innerHTML = isVisible
            ? '<i class="ti ti-user-plus"></i> Add Member'
            : '<i class="ti ti-chevron-up"></i> Hide';
        if (!isVisible) document.getElementById('invite-user-search')?.focus();
    },

    filterMembersList(q) {
        document.querySelectorAll('.member-modal-row').forEach(row => {
            const name = row.querySelector('[style*="font-weight:500"]')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
        });
    },

    filterMembersList_SKIP(q) {
        document.querySelectorAll('.member-modal-row').forEach(row => {
            const name = row.querySelector('[style*="font-weight:500"]')?.textContent?.toLowerCase() || '';
            row.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
        });
    },

    // ─────────────────────────────────────────
    // MESSAGE INPUT
    // ─────────────────────────────────────────
    bindMessageInput() {
        const textarea = document.getElementById('msg-input');
        if (!textarea) return;
        textarea.addEventListener('keydown', async e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await this.sendOrEditMessage(); }
            if (e.key === 'Escape') {
                this.replyingTo = null; this.editingMsgId = null;
                this.hideReplyBar(); textarea.value = ''; textarea.style.height = 'auto';
            }
        });
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
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
            if (res?.success) await this.loadMessages();
            else this.showToast(res?.message || 'Send failed', 'ti-alert-circle');
            this.replyingTo = null;
            this.hideReplyBar();
        }
        if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }
    },

    showReplyBar() {
        let bar = document.getElementById('reply-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'reply-bar';
            bar.style.cssText = 'background:var(--bg-card);border-top:1px solid var(--border);padding:8px 20px;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-secondary);flex-shrink:0';
            document.querySelector('.message-input-bar')?.before(bar);
        }
        bar.innerHTML = `
            <i class="ti ti-arrow-back-up" style="color:var(--accent);font-size:15px"></i>
            <span>Replying to <strong>${this.esc(this.replyingTo?.sender)}</strong>: ${this.esc((this.replyingTo?.text||'').slice(0,60))}…</span>
            <button onclick="App.replyingTo=null;App.hideReplyBar()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;line-height:1">×</button>`;
        document.getElementById('msg-input')?.focus();
    },
    hideReplyBar() { document.getElementById('reply-bar')?.remove(); },

    // Emoji for message text
    toggleMsgEmojiPicker(e) {
        e.stopPropagation();
        const picker = document.getElementById('msg-emoji-picker');
        if (!picker) return;
        document.getElementById('emoji-picker').style.display = 'none';
        if (picker.style.display === 'flex') { picker.style.display = 'none'; return; }
        const rect = e.currentTarget.getBoundingClientRect();
        picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        picker.style.left   = Math.max(8, rect.left - 100) + 'px';
        picker.style.display = 'flex';
    },

    insertMsgEmoji(emoji) {
        const textarea = document.getElementById('msg-input');
        if (!textarea) return;
        const pos = textarea.selectionStart || textarea.value.length;
        textarea.value = textarea.value.slice(0, pos) + emoji + textarea.value.slice(pos);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = pos + emoji.length;
        document.getElementById('msg-emoji-picker').style.display = 'none';
    },

    // ─────────────────────────────────────────
    // SHARE BAR (Article URL)
    // ─────────────────────────────────────────
    bindShareBar() {
        const input = document.getElementById('article-url-input');
        const btn   = document.getElementById('share-article-btn');
        if (!input || !btn) return;
        input.addEventListener('paste', () => setTimeout(() => this.previewOg(input.value.trim()), 300));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') this.shareArticle(input.value.trim()); });
        btn.addEventListener('click', () => this.shareArticle(input.value.trim()));
    },

    async previewOg(url) {
        if (!url || !url.startsWith('http')) return;
        const preview = document.getElementById('og-preview');
        if (!preview) return;
        preview.style.display = 'flex';
        preview.innerHTML = '<span style="font-size:12px;color:var(--text-muted);padding:8px 0">Fetching preview…</span>';
        const res = await ArticlesAPI.fetchOg(url);
        if (res?.success && res.data?.title) {
            preview.innerHTML = `
                <div style="display:flex;gap:10px;align-items:flex-start;background:var(--bg-hover);padding:10px;border-radius:8px;border:1px solid var(--border);width:100%">
                    ${res.data.image ? `<img src="${this.esc(res.data.image)}" style="width:60px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0" onerror="this.style.display='none'">` : ''}
                    <div style="min-width:0;flex:1">
                        <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:0.5px">${this.esc(res.data.source||'')}</div>
                        <div style="font-size:12.5px;font-weight:500;margin-top:2px">${this.esc(res.data.title)}</div>
                        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${this.esc((res.data.description||'').slice(0,100))}</div>
                    </div>
                    <button onclick="document.getElementById('og-preview').style.display='none'" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px">×</button>
                </div>`;
        } else { preview.innerHTML = ''; preview.style.display = 'none'; }
    },

    async shareArticle(url) {
        if (!url) return;
        if (!url.startsWith('http')) { this.showToast('Enter a valid URL starting with http', 'ti-alert-circle'); return; }
        if (!this.currentGroupId)    { this.showToast('Please select a group first', 'ti-alert-circle'); return; }
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

    // ─────────────────────────────────────────
    // REACTIONS
    // ─────────────────────────────────────────
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
        document.getElementById('msg-emoji-picker').style.display = 'none';
        picker.dataset.targetType = targetType;
        picker.dataset.targetId   = targetId;
        const rect = btn.getBoundingClientRect();
        picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        picker.style.left   = Math.max(8, rect.left) + 'px';
        picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex';
    },

    async pickEmoji(emoji) {
        const picker     = document.getElementById('emoji-picker');
        const targetType = picker?.dataset.targetType;
        const targetId   = parseInt(picker?.dataset.targetId);
        if (!targetType || !targetId) return;
        picker.style.display = 'none';
        const res = await ReactionsAPI.toggle(targetType, targetId, emoji);
        if (res?.success) {
            if (targetType === 'article') await this.loadArticles();
            else await this.loadMessages();
        }
    },
    /*Dark mode*/
    bindThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const icon = btn.querySelector('i');

    // Load saved theme
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        if (icon) icon.className = 'ti ti-moon';
    }

    btn.addEventListener('click', () => {
        document.body.classList.toggle('light');
        const isLight = document.body.classList.contains('light');
        if (icon) icon.className = isLight ? 'ti ti-moon' : 'ti ti-sun';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
},

// code end

    // ─────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────
    async loadNotificationBadge() {
        const res   = await NotificationsAPI.unreadCount();
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const cnt = res?.data?.cnt || 0;
        badge.textContent  = cnt;
        badge.style.display = cnt > 0 ? 'inline-flex' : 'none';
    },

    async loadNotifications() {
        const res  = await NotificationsAPI.list();
        const feed = document.getElementById('notifications-feed');
        if (!feed) return;
        feed.innerHTML = '';
        if (!res?.success || res.data.length === 0) {
            feed.innerHTML = `<div class="empty-state"><i class="ti ti-bell-off"></i><p>No notifications yet</p></div>`;
            return;
        }
        const iconMap = {
            reply:          { icon:'ti-arrow-back-up', bg:'var(--accent-soft)',      fg:'var(--accent)' },
            pin:            { icon:'ti-pin',            bg:'rgba(255,101,132,0.12)', fg:'var(--accent2)' },
            group_invite:   { icon:'ti-users',          bg:'rgba(67,217,173,0.12)',  fg:'var(--accent3)' },
            reaction:       { icon:'ti-mood-smile',     bg:'var(--accent-soft)',      fg:'var(--accent)' },
            article_shared: { icon:'ti-newspaper',      bg:'rgba(249,202,36,0.1)',   fg:'#f9ca24' },
            new_message:    { icon:'ti-message-circle', bg:'rgba(108,99,255,0.12)',  fg:'var(--accent)' },
        };
        res.data.forEach(n => {
            const cfg = iconMap[n.notification_type] || { icon:'ti-bell', bg:'var(--bg-hover)', fg:'var(--text-muted)' };
            const el  = document.createElement('div');
            el.className = 'notif-item' + (n.is_read == 0 ? ' unread' : '');
            el.innerHTML = `
                <div class="notif-icon" style="background:${cfg.bg};color:${cfg.fg}"><i class="ti ${cfg.icon}"></i></div>
                <div class="notif-text">${this.esc(n.message)}<div class="notif-time">${this.timeAgo(n.created_at)}</div></div>`;
            el.addEventListener('click', async () => {
                el.classList.remove('unread');
                await NotificationsAPI.markRead(n.id);
                this.loadNotificationBadge();
            });
            feed.appendChild(el);
        });
    },

    // ─────────────────────────────────────────
    // ANALYTICS
    // ─────────────────────────────────────────
    async loadAnalytics() {
        const [overview, groups, articles] = await Promise.all([
            AnalyticsAPI.overview(),
            AnalyticsAPI.activeGroups(),
            AnalyticsAPI.topArticles(),
        ]);
        if (overview?.success) {
            const d = overview.data;
            [['stat-views',d.total_views],['stat-articles',d.articles_this_month],
             ['stat-messages',d.messages_this_month],['stat-users',d.active_users]
            ].forEach(([id,v]) => { const el=document.getElementById(id); if(el) el.textContent=v??'–'; });
        }
        if (groups?.success) {
            const c = document.getElementById('groups-chart'); if (!c) return;
            c.innerHTML = '';
            const max = Math.max(...groups.data.map(g => g.activity_score), 1);
            groups.data.forEach(g => {
                const pct = Math.round((g.activity_score / max) * 100);
                c.innerHTML += `
                    <div class="bar-row">
                        <span class="bar-label" style="min-width:130px;font-size:12px">${this.esc(g.name)}</span>
                        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
                        <span class="bar-val">${g.activity_score}</span>
                    </div>`;
            });
        }
        if (articles?.success) {
            const c = document.getElementById('top-articles-list'); if (!c) return;
            c.innerHTML = '';
            if (articles.data.length === 0) { c.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">No articles shared yet</div>'; return; }
            articles.data.slice(0,5).forEach((a,i) => {
                c.innerHTML += `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                        <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:var(--accent);min-width:24px">${i+1}</span>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.esc(a.article_title||a.article_url)}</div>
                            <div style="font-size:11px;color:var(--text-muted)">${this.esc(a.source_name||'')} · ${a.view_count} views</div>
                        </div>
                    </div>`;
            });
        }
    },

    // ─────────────────────────────────────────
    // SEARCH
    // ─────────────────────────────────────────
    initSearch() {
        const input = document.querySelector('#page-search input[type="text"]');
        if (!input || input.dataset.bound) return;
        input.dataset.bound = '1';
        input.addEventListener('input', () => this.doSearch(input.value.trim()));
    },

    async doSearch(q) {
        const container = document.querySelector('#page-search .search-results');
        if (!container) return;
        if (!q) { container.style.opacity = '0.4'; return; }
        container.style.opacity = '1';
        container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Searching…</div>';
        const [usersRes, groupsRes] = await Promise.all([UsersAPI.list(q), GroupsAPI.list()]);
        container.innerHTML = '';
        if (usersRes?.success && usersRes.data.length > 0) {
            container.innerHTML += `<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">MEMBERS</div>`;
            usersRes.data.slice(0,5).forEach(u => {
                const initials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
                container.innerHTML += `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                        <div class="avatar" style="width:30px;height:30px;font-size:11px;background:linear-gradient(135deg,var(--accent),var(--accent2))">${initials}</div>
                        <div><div style="font-size:13px;font-weight:500">${this.esc(u.name)}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${this.esc(u.email)} · ${u.role}</div></div>
                    </div>`;
            });
        }
        if (groupsRes?.success) {
            const matching = groupsRes.data.filter(g => g.name.toLowerCase().includes(q.toLowerCase()));
            if (matching.length > 0) {
                container.innerHTML += `<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;margin-top:12px">GROUPS</div>`;
                matching.forEach(g => {
                    container.innerHTML += `
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="App.selectGroup(${g.id},'${this.esc(g.name)}')">
                            <i class="ti ti-users" style="color:var(--accent);font-size:18px"></i>
                            <div><div style="font-size:13px;font-weight:500">${this.esc(g.name)}</div>
                            <div style="font-size:11px;color:var(--text-muted)">${g.member_count} members</div></div>
                        </div>`;
                });
            }
        }
        if (!container.innerHTML) {
            container.innerHTML = `<div class="empty-state" style="padding:20px"><i class="ti ti-search"></i><p>No results for "${this.esc(q)}"</p></div>`;
        }
    },

    // ─────────────────────────────────────────
    // MODALS
    // ─────────────────────────────────────────
    bindModals() {
        // Create group
        document.getElementById('create-group-btn')?.addEventListener('click', async () => {
            if (!Auth.isAdmin()) { this.showToast('Only admins can create groups', 'ti-lock'); return; }
            const res = await UsersAPI.list();
            if (res?.success) {
                const container = document.getElementById('member-select-list');
                if (container) {
                    container.innerHTML = '';
                    const me = Auth.getUser();
                    res.data.forEach(u => {
                        if (u.id == me.id) return;
                        const li = document.createElement('label');
                        li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;font-size:13px;color:var(--text-secondary);border-radius:4px';
                        li.onmouseover = () => li.style.background = 'var(--bg-hover)';
                        li.onmouseout  = () => li.style.background = '';
                        const initials = u.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
                        li.innerHTML = `
                            <input type="checkbox" value="${u.id}" style="accent-color:var(--accent)">
                            <div class="avatar" style="width:22px;height:22px;font-size:8px;background:linear-gradient(135deg,var(--accent),var(--accent2));flex-shrink:0">${initials}</div>
                            ${this.esc(u.name)} <span style="color:var(--text-muted);font-size:11px">(${u.role})</span>`;
                        container.appendChild(li);
                    });
                }
            }
            this.openModal('modal-create-group');
        });

        document.getElementById('create-group-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const name     = document.getElementById('group-name-input')?.value.trim();
            const desc     = document.getElementById('group-desc-input')?.value.trim();
            const memberIds = Array.from(document.querySelectorAll('#member-select-list input:checked')).map(i => parseInt(i.value));
            if (!name) { this.showToast('Group name is required', 'ti-alert-circle'); return; }
            const btn = e.submitter;
            if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }
            const res = await GroupsAPI.create({ name, description:desc, member_ids:memberIds });
            if (btn) { btn.textContent = 'Create Group'; btn.disabled = false; }
            if (res?.success) {
                this.closeAllModals();
                document.getElementById('group-name-input').value = '';
                document.getElementById('group-desc-input').value = '';
                this.showToast(`Group "${name}" created!`, 'ti-check');
                await this.loadGroups();
            } else this.showToast(res?.message || 'Failed to create group', 'ti-alert-circle');
        });

        // Forward form
        document.getElementById('forward-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const groupIds = Array.from(document.querySelectorAll('#forward-group-list input:checked')).map(i => parseInt(i.value));
            if (!groupIds.length) { this.showToast('Select at least one group', 'ti-alert-circle'); return; }
            const fwd = this._forwardTarget;
            const res = fwd?.type === 'article'
                ? await ArticlesAPI.forward(fwd.id, groupIds)
                : await MessagesAPI.forward(fwd.id, groupIds);
            if (res?.success) { this.closeAllModals(); this.showToast('Forwarded successfully!', 'ti-check'); }
            else this.showToast(res?.message || 'Forward failed', 'ti-alert-circle');
        });

        // Profile form
        document.getElementById('profile-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const payload = {
                name:      document.getElementById('profile-name-input').value.trim(),
                job_title: document.getElementById('profile-title-input').value.trim(),
                org:       document.getElementById('profile-org-input').value.trim(),
            };
            if (!payload.name) { this.showToast('Name is required', 'ti-alert-circle'); return; }
            const res = await UsersAPI.updateProfile(payload);
            if (res?.success) {
                const user = Auth.getUser(); user.name = payload.name; Auth.setUser(user);
                this.renderCurrentUser();
                this.closeAllModals();
                this.showToast('Profile updated!', 'ti-check');
            } else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
        });

        // Change password
        document.getElementById('change-password-form')?.addEventListener('submit', async e => {
            e.preventDefault();
            const cur  = document.getElementById('cur-password').value;
            const nw   = document.getElementById('new-password').value;
            const conf = document.getElementById('confirm-password').value;
            if (nw !== conf) { this.showToast('Passwords do not match', 'ti-alert-circle'); return; }
            if (nw.length < 8) { this.showToast('Min 8 characters', 'ti-alert-circle'); return; }
            const res = await UsersAPI.changePassword(cur, nw);
            if (res?.success) { this.closeAllModals(); this.showToast('Password changed! Logging out…', 'ti-check'); setTimeout(() => AuthAPI.logout(), 1500); }
            else this.showToast(res?.message || 'Failed', 'ti-alert-circle');
        });

        // Open members modal from right panel button
        document.querySelector('[data-modal="modal-members"]')?.addEventListener('click', e => {
            e.preventDefault();
            this.openMembersModal();
        });

        // Open members modal from channel header
        document.querySelectorAll('[title="Members"]').forEach(btn =>
            btn.addEventListener('click', () => this.openMembersModal()));

        // Profile avatar click
        document.querySelector('.avatar[title="My Profile"]')?.addEventListener('click', () => this.openProfileModal());

        // Generic close
        document.querySelectorAll('.modal-close, [data-close-modal]').forEach(el =>
            el.addEventListener('click', () => this.closeAllModals()));
        document.querySelectorAll('.modal-overlay').forEach(overlay =>
            overlay.addEventListener('click', e => { if (e.target === overlay) this.closeAllModals(); }));
    },

    async openForwardModal(type, id) {
        this._forwardTarget = { type, id };
        const res = await GroupsAPI.list();
        const container = document.getElementById('forward-group-list');
        if (container && res?.success) {
            container.innerHTML = '';
            const filtered = res.data.filter(g => g.id !== this.currentGroupId);
            if (filtered.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">No other groups available</div>';
            } else {
                filtered.forEach(g => {
                    const initials = g.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
                    const li = document.createElement('label');
                    li.style.cssText = 'display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);color:var(--text-secondary)';
                    li.innerHTML = `
                        <input type="checkbox" value="${g.id}" style="accent-color:var(--accent)">
                        <div style="width:26px;height:26px;border-radius:6px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${initials}</div>
                        <span style="flex:1">${this.esc(g.name)}</span>
                        <span style="font-size:11px;color:var(--text-muted)">${g.member_count} members</span>`;
                    container.appendChild(li);
                });
            }
        }
        this.openModal('modal-forward');
    },

    openProfileModal() {
        const user = Auth.getUser(); if (!user) return;
        const initials = user.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
        const el = document.getElementById('profile-avatar'); if (el) el.textContent = initials;
        document.getElementById('profile-name').textContent  = user.name;
        document.getElementById('profile-email').textContent = user.email;
        document.getElementById('profile-role-badge').innerHTML = `<span class="tag tag-${user.role==='admin'?'purple':'teal'}">${user.role}</span>`;
        document.getElementById('profile-name-input').value  = user.name      || '';
        document.getElementById('profile-title-input').value = user.job_title || '';
        document.getElementById('profile-org-input').value   = user.org       || '';
        this.openModal('modal-profile');
    },

    openModal(id)    { document.getElementById(id)?.classList.add('open'); },
    closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); },

    // ─────────────────────────────────────────
    // CONTEXT MENU
    // ─────────────────────────────────────────
    bindContextMenus() {
        document.addEventListener('click', e => {
            if (!e.target.closest('#ctx-menu'))
                document.getElementById('ctx-menu')?.classList.remove('open');
            if (!e.target.closest('#emoji-picker') && !e.target.closest('.react-btn,.react-msg-btn'))
                document.getElementById('emoji-picker').style.display = 'none';
            if (!e.target.closest('#msg-emoji-picker') && !e.target.closest('#emoji-btn'))
                document.getElementById('msg-emoji-picker').style.display = 'none';
            if (!e.target.closest('#invite-search-results') && !e.target.closest('#invite-user-search')) {
                const c = document.getElementById('invite-search-results');
                if (c) c.style.display = 'none';
            }
        });
    },

    //add notification sound
    playNotificationSound() {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    },

    showCtxMenu(e) {
        const menu = document.getElementById('ctx-menu'); if (!menu) return;
        const user = Auth.getUser();
        const isOwner = this.ctxTarget?.ownerId === user?.id;
        menu.innerHTML = '';
        if (Auth.isAdmin() && this.ctxTarget?.type === 'article')
            menu.innerHTML += `<div class="ctx-item" onclick="App.ctxPin()"><i class="ti ti-pin"></i> Pin / Unpin</div>`;
        menu.innerHTML += `<div class="ctx-item" onclick="App.ctxForward()"><i class="ti ti-share"></i> Forward</div>`;
        menu.innerHTML += `<div class="ctx-item" onclick="App.ctxCopy()"><i class="ti ti-copy"></i> Copy link</div>`;
        if (isOwner || Auth.isAdmin())
            menu.innerHTML += `<div class="divider" style="margin:4px 0"></div><div class="ctx-item danger" onclick="App.ctxDelete()"><i class="ti ti-trash"></i> Delete</div>`;
        menu.style.left = Math.min(e.clientX, window.innerWidth-180) + 'px';
        menu.style.top  = Math.min(e.clientY, window.innerHeight-160) + 'px';
        menu.classList.add('open');
    },

    async ctxPin() {
        document.getElementById('ctx-menu')?.classList.remove('open');
        const articles = await ArticlesAPI.list(this.currentGroupId);
        const article  = articles?.data?.find(a => a.id == this.ctxTarget.id);
        const res = article?.is_pinned == 1
            ? await ArticlesAPI.unpin(this.ctxTarget.id)
            : await ArticlesAPI.pin(this.ctxTarget.id);
        if (res?.success) { this.showToast(article?.is_pinned==1?'Unpinned':'Article pinned!','ti-check'); await this.loadArticles(); }
        else this.showToast(res?.message||'Failed','ti-alert-circle');
    },
    ctxForward() { document.getElementById('ctx-menu')?.classList.remove('open'); if (this.ctxTarget) this.openForwardModal(this.ctxTarget.type, this.ctxTarget.id); },
    ctxCopy()    { document.getElementById('ctx-menu')?.classList.remove('open'); navigator.clipboard?.writeText(window.location.href).then(()=>this.showToast('Copied!','ti-copy')); },
    async ctxDelete() {
        document.getElementById('ctx-menu')?.classList.remove('open');
        if (!this.ctxTarget || !confirm('Delete this item?')) return;
        const res = this.ctxTarget.type === 'article'
            ? await ArticlesAPI.delete(this.ctxTarget.id)
            : await MessagesAPI.delete(this.ctxTarget.id);
        if (res?.success) { this.showToast('Deleted','ti-check'); this.ctxTarget.type==='article'?await this.loadArticles():await this.loadMessages(); }
        else this.showToast(res?.message||'Failed','ti-alert-circle');
    },

    // ─────────────────────────────────────────
    // TAB BAR
    // ─────────────────────────────────────────

    bindTabBar() {
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', async () => {
                tab.closest('.tab-bar').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                tab.closest('.page')?.querySelectorAll('.tab-panel').forEach(p => {
                    p.style.display = p.id === tab.dataset.tab ? '' : 'none';
                });

                const shareBar = document.querySelector('.share-article-bar');
                const ogPreview = document.getElementById('og-preview');

                if (tab.dataset.tab === 'tab-chat') {
                    if (shareBar) shareBar.style.display = 'none';
                    if (ogPreview) ogPreview.style.display = 'none';
                    await this.loadMessages();
                    setTimeout(() => {
                        const chatPanel = document.getElementById('tab-chat');
                        if (chatPanel) chatPanel.scrollTop = chatPanel.scrollHeight;
                    }, 100);
                } else {
                    if (shareBar) shareBar.style.display = '';
                }
            });
        });
    },

    // ─────────────────────────────────────────
    // TOAST
    // ─────────────────────────────────────────
    showToast(msg, icon = 'ti-info-circle') {
        const container = document.getElementById('toast-container'); if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="ti ${icon}"></i> ${msg}`;
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(()=>toast.remove(),300); }, 2800);
    },

    // ─────────────────────────────────────────
    // UTILS
    // ─────────────────────────────────────────
    esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
    timeAgo(dateStr) {
        const d = Math.floor((Date.now()-new Date(dateStr).getTime())/1000);
        if (d < 60)    return 'just now';
        if (d < 3600)  return Math.floor(d/60)+'m ago';
        if (d < 86400) return Math.floor(d/3600)+'h ago';
        return Math.floor(d/86400)+'d ago';
    },
    formatTime(dateStr) {
        return new Date(dateStr).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());