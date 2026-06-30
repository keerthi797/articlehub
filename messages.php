<?php
// messages.php  →  http://localhost/article-dashboard/messages.php?action=list&group_id=1
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'list'    => listMessages(),
    'send'    => sendMessage(),
    'edit'    => editMessage(),
    'delete'  => deleteMessage(),
    'seen'    => markSeen(),
    'forward' => forwardMessage(),
    default   => jsonError('Unknown action', 404),
};

function listMessages(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['group_id'] ?? 0);
    $limit   = min((int)($_GET['limit'] ?? 50), 100);
    $before  = (int)($_GET['before'] ?? 0);

    if (!$groupId) jsonError('group_id required');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);

    $db     = getDB();
    $params = [$user['id'], $groupId];
    $sql    = "
        SELECT m.*,
               u.name  AS sender_name,
               u.role  AS sender_role,
               (SELECT COUNT(*) FROM message_seen ms WHERE ms.message_id=m.id) AS seen_count,
               rm.message AS reply_text,
               ru.name    AS reply_sender_name
        FROM messages m
        JOIN users u ON u.id=m.user_id
        LEFT JOIN messages rm ON rm.id=m.reply_to
        LEFT JOIN users ru ON ru.id=rm.user_id
        WHERE m.group_id=?
    ";
    // re-order params: user_id first for my_seen_at subquery removed for simplicity
    $params = [$groupId];
    if ($before) { $sql .= " AND m.id<?"; $params[] = $before; }
    $sql .= " ORDER BY m.created_at DESC LIMIT $limit";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $messages = array_reverse($stmt->fetchAll());

    $reactStmt = $db->prepare("
        SELECT reaction_type, COUNT(*) AS cnt FROM reactions
        WHERE target_type='message' AND target_id=? GROUP BY reaction_type
    ");
    foreach ($messages as &$msg) {
        $reactStmt->execute([$msg['id']]);
        $msg['reactions'] = $reactStmt->fetchAll();
        if ($msg['is_deleted']) $msg['message'] = 'This message was deleted';
    }
    jsonSuccess($messages);
}

function sendMessage(): void {
    $user    = requireAuth();
    $body    = getBody();
    $groupId = (int)($body['group_id'] ?? 0);
    $message = trim($body['message'] ?? '');
    $replyTo = ($body['reply_to'] ?? null) ? (int)$body['reply_to'] : null;

    if (!$groupId) jsonError('group_id required');
    if (!$message) jsonError('Message cannot be empty');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);

    $db = getDB();
    $db->prepare("INSERT INTO messages (group_id,user_id,message,reply_to) VALUES (?,?,?,?)")
       ->execute([$groupId, $user['id'], $message, $replyTo]);
    $msgId = (int)$db->lastInsertId();

    if ($replyTo) {
        $s = $db->prepare("SELECT user_id FROM messages WHERE id=?");
        $s->execute([$replyTo]);
        $orig = $s->fetch();
        if ($orig) createNotification($orig['user_id'], $user['id'], 'reply', 'message', $msgId, $user['name'].' replied to your message');
    }

    $stmt = $db->prepare("
        SELECT m.*, u.name AS sender_name, u.role AS sender_role,
               rm.message AS reply_text, ru.name AS reply_sender_name
        FROM messages m
        JOIN users u ON u.id=m.user_id
        LEFT JOIN messages rm ON rm.id=m.reply_to
        LEFT JOIN users ru ON ru.id=rm.user_id
        WHERE m.id=?
    ");
    $stmt->execute([$msgId]);
    jsonSuccess($stmt->fetch(), 'Message sent', 201);
}

function editMessage(): void {
    $user  = requireAuth();
    $msgId = (int)($_GET['id'] ?? 0);
    $body  = getBody();
    $text  = trim($body['message'] ?? '');
    if (!$msgId) jsonError('Message ID required');
    if (!$text)  jsonError('Message cannot be empty');

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM messages WHERE id=?");
    $stmt->execute([$msgId]);
    $msg = $stmt->fetch();
    if (!$msg)                           jsonError('Message not found', 404);
    if ($msg['user_id'] !== $user['id']) jsonError('You can only edit your own messages', 403);
    if ($msg['is_deleted'])              jsonError('Cannot edit a deleted message');

    $db->prepare("UPDATE messages SET message=?, is_edited=1 WHERE id=?")->execute([$text, $msgId]);
    jsonSuccess(['message'=>$text], 'Message updated');
}

function deleteMessage(): void {
    $user  = requireAuth();
    $msgId = (int)($_GET['id'] ?? 0);
    if (!$msgId) jsonError('Message ID required');

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM messages WHERE id=?");
    $stmt->execute([$msgId]);
    $msg = $stmt->fetch();
    if (!$msg) jsonError('Message not found', 404);
    if ($msg['user_id'] !== $user['id'] && $user['role'] !== 'admin') jsonError('Access denied', 403);

    $db->prepare("UPDATE messages SET is_deleted=1, message='This message was deleted' WHERE id=?")
       ->execute([$msgId]);
    jsonSuccess([], 'Message deleted');
}

function markSeen(): void {
    $user  = requireAuth();
    $msgId = (int)($_GET['id'] ?? 0);
    if (!$msgId) jsonError('Message ID required');
    getDB()->prepare("INSERT IGNORE INTO message_seen (message_id,user_id) VALUES (?,?)")
           ->execute([$msgId, $user['id']]);
    jsonSuccess([], 'Marked as seen');
}

function forwardMessage(): void {
    $user    = requireAuth();
    $body    = getBody();
    $msgId   = (int)($body['message_id'] ?? 0);
    $targets = $body['group_ids'] ?? [];
    if (!$msgId || empty($targets)) jsonError('message_id and group_ids required');

    $db   = getDB();
    $stmt = $db->prepare("SELECT * FROM messages WHERE id=? AND is_deleted=0");
    $stmt->execute([$msgId]);
    $msg = $stmt->fetch();
    if (!$msg) jsonError('Message not found', 404);

    $ins = $db->prepare("INSERT INTO messages (group_id,user_id,message,is_forwarded) VALUES (?,?,?,1)");
    foreach ($targets as $gid) {
        $gid = (int)$gid;
        if ($gid && isMember($gid, $user['id'])) $ins->execute([$gid, $user['id'], $msg['message']]);
    }
    jsonSuccess([], 'Message forwarded');
}
