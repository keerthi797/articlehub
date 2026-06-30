<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'toggle' => toggleReaction(),
    'list'   => listReactions(),
    default  => jsonError('Unknown action', 404),
};

function toggleReaction(): void {
    $user         = requireAuth();
    $body         = getBody();
    $targetType   = $body['target_type']   ?? '';
    $targetId     = (int)($body['target_id']   ?? 0);
    $reactionType = trim($body['reaction_type'] ?? '');
    $allowed      = ['👍','❤️','😂','😮','🔥','👏'];

    if (!in_array($targetType, ['article','message'])) jsonError('Invalid target_type');
    if (!$targetId)                                     jsonError('target_id required');
    if (!in_array($reactionType, $allowed))             jsonError('Invalid reaction');

    $db   = getDB();
    $stmt = $db->prepare("SELECT id,reaction_type FROM reactions WHERE target_type=? AND target_id=? AND user_id=?");
    $stmt->execute([$targetType, $targetId, $user['id']]);
    $existing = $stmt->fetch();

    if ($existing) {
        if ($existing['reaction_type'] === $reactionType) {
            $db->prepare("DELETE FROM reactions WHERE id=?")->execute([$existing['id']]);
            $action = 'removed';
        } else {
            $db->prepare("UPDATE reactions SET reaction_type=? WHERE id=?")->execute([$reactionType,$existing['id']]);
            $action = 'switched';
        }
    } else {
        $db->prepare("INSERT INTO reactions (target_type,target_id,user_id,reaction_type) VALUES (?,?,?,?)")
           ->execute([$targetType,$targetId,$user['id'],$reactionType]);
        $action = 'added';
        if ($targetType === 'article') {
            $s = $db->prepare("SELECT shared_by FROM articles WHERE id=?"); $s->execute([$targetId]);
            $o = $s->fetch();
            if ($o) createNotification($o['shared_by'],$user['id'],'reaction','article',$targetId,$user['name'].' reacted '.$reactionType.' to your article');
        } else {
            $s = $db->prepare("SELECT user_id FROM messages WHERE id=?"); $s->execute([$targetId]);
            $o = $s->fetch();
            if ($o) createNotification($o['user_id'],$user['id'],'reaction','message',$targetId,$user['name'].' reacted '.$reactionType.' to your message');
        }
    }

    $counts = $db->prepare("SELECT reaction_type, COUNT(*) AS cnt FROM reactions WHERE target_type=? AND target_id=? GROUP BY reaction_type");
    $counts->execute([$targetType,$targetId]);
    jsonSuccess(['action'=>$action,'reactions'=>$counts->fetchAll()]);
}

function listReactions(): void {
    requireAuth();
    $targetType = $_GET['target_type'] ?? '';
    $targetId   = (int)($_GET['target_id'] ?? 0);
    if (!in_array($targetType,['article','message'])||!$targetId) jsonError('Invalid params');
    $stmt = getDB()->prepare("SELECT r.reaction_type,u.id AS user_id,u.name AS user_name FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.target_type=? AND r.target_id=? ORDER BY r.created_at");
    $stmt->execute([$targetType,$targetId]);
    jsonSuccess($stmt->fetchAll());
}
