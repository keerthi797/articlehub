<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'list'          => listGroups(),
    'get'           => getGroup(),
    'create'        => createGroup(),
    'update'        => updateGroup(),
    'delete'        => deleteGroup(),
    'members'       => getMembers(),
    'add_member'    => addMember(),
    'remove_member' => removeMember(),
    default         => jsonError('Unknown action', 404),
};

function listGroups(): void {
    $user = requireAuth();
    $stmt = getDB()->prepare("
        SELECT g.id, g.name, g.description, g.created_by, g.created_at,
               u.name AS creator_name,
               (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
               (SELECT COUNT(*) FROM articles a WHERE a.group_id=g.id) AS article_count
        FROM groups g
        JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=?
        JOIN users u ON u.id=g.created_by
        ORDER BY g.created_at DESC
    ");
    $stmt->execute([$user['id']]);
    jsonSuccess($stmt->fetchAll());
}

function getGroup(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['id'] ?? 0);
    if (!$groupId) jsonError('Group ID required');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);

    $stmt = getDB()->prepare("SELECT g.*, u.name AS creator_name, (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS member_count FROM groups g JOIN users u ON u.id=g.created_by WHERE g.id=?");
    $stmt->execute([$groupId]);
    $group = $stmt->fetch();
    if (!$group) jsonError('Group not found', 404);
    jsonSuccess($group);
}

function createGroup(): void {
    $user        = requireAdmin();
    $body        = getBody();
    $name        = trim($body['name']        ?? '');
    $description = trim($body['description'] ?? '');
    $memberIds   = $body['member_ids']       ?? [];
    if (!$name) jsonError('Group name is required');

    $db = getDB();
    $db->prepare("INSERT INTO groups (name,description,created_by) VALUES (?,?,?)")
       ->execute([$name, $description, $user['id']]);
    $groupId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO group_members (group_id,user_id) VALUES (?,?)")->execute([$groupId, $user['id']]);
    $ins = $db->prepare("INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)");
    foreach ($memberIds as $mid) { $mid=(int)$mid; if ($mid && $mid!==$user['id']) $ins->execute([$groupId,$mid]); }

    $stmt = $db->prepare("SELECT * FROM groups WHERE id=?"); $stmt->execute([$groupId]);
    jsonSuccess($stmt->fetch(), 'Group created', 201);
}

function updateGroup(): void {
    requireAdmin();
    $groupId = (int)($_GET['id'] ?? 0);
    $body    = getBody();
    $name    = trim($body['name'] ?? '');
    if (!$groupId || !$name) jsonError('Group ID and name required');
    getDB()->prepare("UPDATE groups SET name=?, description=? WHERE id=?")->execute([$name, $body['description']??'', $groupId]);
    jsonSuccess([], 'Group updated');
}

function deleteGroup(): void {
    requireAdmin();
    $groupId = (int)($_GET['id'] ?? 0);
    if (!$groupId) jsonError('Group ID required');
    getDB()->prepare("DELETE FROM groups WHERE id=?")->execute([$groupId]);
    jsonSuccess([], 'Group deleted');
}

function getMembers(): void {
    $user    = requireAuth();
    $groupId = (int)($_GET['id'] ?? 0);
    if (!$groupId) jsonError('Group ID required');
    if (!isMember($groupId, $user['id'])) jsonError('Access denied', 403);
    $stmt = getDB()->prepare("SELECT u.id,u.name,u.email,u.role,u.job_title,u.avatar,u.last_seen,gm.joined_at FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY u.name");
    $stmt->execute([$groupId]);
    jsonSuccess($stmt->fetchAll());
}

function addMember(): void {
    $user    = requireAdmin();
    $groupId = (int)($_GET['id'] ?? 0);
    $body    = getBody();
    $userId  = (int)($body['user_id'] ?? 0);
    if (!$groupId || !$userId) jsonError('Group ID and User ID required');
    getDB()->prepare("INSERT IGNORE INTO group_members (group_id,user_id) VALUES (?,?)")->execute([$groupId,$userId]);
    createNotification($userId, $user['id'], 'group_invite', 'group', $groupId, $user['name'].' added you to a group');
    jsonSuccess([], 'Member added');
}

function removeMember(): void {
    requireAdmin();
    $groupId = (int)($_GET['id'] ?? 0);
    $body    = getBody();
    $userId  = (int)($body['user_id'] ?? 0);
    if (!$groupId || !$userId) jsonError('Group ID and User ID required');
    getDB()->prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?")->execute([$groupId,$userId]);
    jsonSuccess([], 'Member removed');
}
