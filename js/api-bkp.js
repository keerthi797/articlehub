// js/api.js – Centralized API layer

// Dynamic base: works whatever folder name you use in htdocs
function getApiBase() {
    const parts = window.location.pathname.split('/');
    parts.pop(); // remove filename (auth.html or index.html)
    return parts.join('/');
}

const Auth = {
    getToken:   ()  => localStorage.getItem('ah_token'),
    setToken:   (t) => localStorage.setItem('ah_token', t),
    getUser:    ()  => JSON.parse(localStorage.getItem('ah_user') || 'null'),
    setUser:    (u) => localStorage.setItem('ah_user', JSON.stringify(u)),
    clear:      ()  => { localStorage.removeItem('ah_token'); localStorage.removeItem('ah_user'); },
    isAdmin:    ()  => Auth.getUser()?.role === 'admin',
    isLoggedIn: ()  => !!Auth.getToken(),
    forgotPassword: (email) => apiFetch('/auth.php?action=forgot_password', { method:'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token, password) => apiFetch('/auth.php?action=reset_password', { method:'POST', body: JSON.stringify({ token,  password }) }),
};

async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
        const res = await fetch(getApiBase() + endpoint, { ...options, headers: { ...headers, ...(options.headers || {}) } });
        const data = await res.json();
        if (res.status === 401 && window.location.pathname.indexOf('auth.html') === -1) {
            Auth.clear();
            window.location.href = 'auth.html';
            return null;
        }
        return data;
    } catch (err) {
        console.error('API Error:', err);
        return { success: false, message: 'Network error – check XAMPP is running and folder path is correct. Current base: ' + API_BASE };
    }
}

const AuthAPI = {
    login:    (email, password) => apiFetch('/auth.php?action=login',    { method:'POST', body: JSON.stringify({ email, password }) }),
    register: (payload)         => apiFetch('/auth.php?action=register', { method:'POST', body: JSON.stringify(payload) }),
    logout:   async ()          => { await apiFetch('/auth.php?action=logout', { method:'POST' }); Auth.clear(); window.location.href = 'auth.html'; },
    me:       ()                => apiFetch('/auth.php?action=me'),
};

const GroupsAPI = {
    list:         ()              => apiFetch('/groups.php?action=list'),
    get:          (id)            => apiFetch(`/groups.php?action=get&id=${id}`),
    create:       (payload)       => apiFetch('/groups.php?action=create',        { method:'POST', body: JSON.stringify(payload) }),
    update:       (id, payload)   => apiFetch(`/groups.php?action=update&id=${id}`,{ method:'POST', body: JSON.stringify(payload) }),
    delete:       (id)            => apiFetch(`/groups.php?action=delete&id=${id}`,{ method:'POST' }),
    members:      (id)            => apiFetch(`/groups.php?action=members&id=${id}`),
    addMember:    (gid, uid)      => apiFetch(`/groups.php?action=add_member&id=${gid}`,    { method:'POST', body: JSON.stringify({ user_id: uid }) }),
    removeMember:  (gid, uid)      => apiFetch(`/groups.php?action=remove_member&id=${gid}`, { method:'POST', body: JSON.stringify({ user_id: uid }) }),
    inviteLink:    (id)            => apiFetch(`/groups.php?action=invite_link&id=${id}`, { method:'POST' }),
};

const ArticlesAPI = {
    list:        (groupId) => apiFetch(`/articles.php?action=list&group_id=${groupId}`),
    share:       (groupId, url) => apiFetch('/articles.php?action=share', { method:'POST', body: JSON.stringify({ group_id: groupId, url }) }),
    pin:         (id)      => apiFetch(`/articles.php?action=pin&id=${id}`,   { method:'POST' }),
    unpin:       (id)      => apiFetch(`/articles.php?action=unpin&id=${id}`, { method:'POST' }),
    delete:      (id)      => apiFetch(`/articles.php?action=delete&id=${id}`,{ method:'POST' }),
    forward:     (articleId, groupIds) => apiFetch('/articles.php?action=forward', { method:'POST', body: JSON.stringify({ article_id: articleId, group_ids: groupIds }) }),
    recordView:  (id)      => apiFetch(`/articles.php?action=view&id=${id}`,  { method:'POST' }),
    getViews:    (id)      => apiFetch(`/articles.php?action=views&id=${id}`),
    fetchOg:     (url)     => apiFetch(`/articles.php?action=fetch_og&url=${encodeURIComponent(url)}`),
    
};

const MessagesAPI = {
    list:      (groupId, before = 0) => apiFetch(`/messages.php?action=list&group_id=${groupId}&before=${before}`),
    send:      (groupId, message, replyTo = null) => apiFetch('/messages.php?action=send', { method:'POST', body: JSON.stringify({ group_id: groupId, message, reply_to: replyTo }) }),
    edit:      (id, message) => apiFetch(`/messages.php?action=edit&id=${id}`,   { method:'POST', body: JSON.stringify({ message }) }),
    delete:    (id)          => apiFetch(`/messages.php?action=delete&id=${id}`, { method:'POST' }),
    markSeen:  (id)          => apiFetch(`/messages.php?action=seen&id=${id}`,   { method:'POST' }),
    forward:   (messageId, groupIds) => apiFetch('/messages.php?action=forward', { method:'POST', body: JSON.stringify({ message_id: messageId, group_ids: groupIds }) }),
};

const ReactionsAPI = {
    toggle: (targetType, targetId, reactionType) => apiFetch('/reactions.php?action=toggle', { method:'POST', body: JSON.stringify({ target_type: targetType, target_id: targetId, reaction_type: reactionType }) }),
    list:   (targetType, targetId) => apiFetch(`/reactions.php?action=list&target_type=${targetType}&target_id=${targetId}`),
};

const NotificationsAPI = {
    list:        ()   => apiFetch('/notifications.php?action=list'),
    markRead:    (id) => apiFetch(`/notifications.php?action=read&id=${id}`, { method:'POST' }),
    markAllRead: ()   => apiFetch('/notifications.php?action=read_all',      { method:'POST' }),
    unreadCount: ()   => apiFetch('/notifications.php?action=unread_count'),
};

const AnalyticsAPI = {
    overview:      ()            => apiFetch('/analytics.php?action=overview'),
    activeGroups:  ()            => apiFetch('/analytics.php?action=active_groups'),
    topArticles:   (limit = 10)  => apiFetch(`/analytics.php?action=top_articles&limit=${limit}`),
    userActivity:  ()            => apiFetch('/analytics.php?action=user_activity'),
};

const UsersAPI = {
    list:            (search = '') => apiFetch(`/users.php?action=list&search=${encodeURIComponent(search)}`),
    updateProfile:   (payload)     => apiFetch('/users.php?action=update_profile',  { method:'POST', body: JSON.stringify(payload) }),
    changePassword:  (cur, nw)     => apiFetch('/users.php?action=change_password', { method:'POST', body: JSON.stringify({ current_password: cur, new_password: nw }) }),
    deactivate:      (id)          => apiFetch(`/users.php?action=deactivate&id=${id}`, { method:'POST' }),
};
