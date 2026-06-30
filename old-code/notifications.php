<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'list'         => listNotifications(),
    'read'         => markRead(),
    'read_all'     => markAllRead(),
    'unread_count' => unreadCount(),
    default        => jsonError('Unknown action', 404),
};

function listNotifications(): void {
    $user  = requireAuth();
    $limit = min((int)($_GET['limit'] ?? 30), 100);
    $stmt  = getDB()->prepare("
       

        SELECT 
    n.*, 
    a.name AS actor_name,
    g.name AS group_name
FROM notifications n
LEFT JOIN users a 
    ON a.id = n.actor_id
LEFT JOIN messages m 
    ON m.id = n.reference_id
LEFT JOIN groups g 
    ON g.id = m.group_id
WHERE n.user_id = ?
ORDER BY n.created_at DESC
LIMIT $limit
    ");
    $stmt->execute([$user['id']]);
    jsonSuccess($stmt->fetchAll());
}

function markRead(): void {
    $user = requireAuth();
    $id   = (int)($_GET['id'] ?? 0);
    if (!$id) jsonError('Notification ID required');
    getDB()->prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?")->execute([$id,$user['id']]);
    jsonSuccess([], 'Marked as read');
}

function markAllRead(): void {
    $user = requireAuth();
    getDB()->prepare("UPDATE notifications SET is_read=1 WHERE user_id=?")->execute([$user['id']]);
    jsonSuccess([], 'All marked as read');
}

function unreadCount(): void {
    $user = requireAuth();
    $stmt = getDB()->prepare("SELECT COUNT(*) AS cnt FROM notifications WHERE user_id=? AND is_read=0");
    $stmt->execute([$user['id']]);
    jsonSuccess($stmt->fetch());
}
