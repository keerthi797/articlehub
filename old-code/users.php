<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'list'            => listUsers(),
    'update_profile'  => updateProfile(),
    'change_password' => changePassword(),
    'deactivate'      => deactivateUser(),
    default           => jsonError('Unknown action', 404),
};

function listUsers(): void {
    requireAuth();
    $search = trim($_GET['search'] ?? '');
    $db     = getDB();
    if ($search) {
        $like = "%$search%";
        $stmt = $db->prepare("SELECT id,name,email,role,job_title,org,avatar,last_seen FROM users WHERE is_active=1 AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 30");
        $stmt->execute([$like,$like]);
    } else {
        $stmt = $db->query("SELECT id,name,email,role,job_title,org,avatar,last_seen FROM users WHERE is_active=1 ORDER BY name");
    }
    jsonSuccess($stmt->fetchAll());
}

function updateProfile(): void {
    $user     = requireAuth();
    $body     = getBody();
    $name     = trim($body['name']      ?? '');
    $jobTitle = trim($body['job_title'] ?? '');
    $org      = trim($body['org']       ?? '');
    if (!$name) jsonError('Name is required');
    getDB()->prepare("UPDATE users SET name=?,job_title=?,org=? WHERE id=?")->execute([$name,$jobTitle,$org,$user['id']]);
    jsonSuccess(['name'=>$name,'job_title'=>$jobTitle,'org'=>$org], 'Profile updated');
}

function changePassword(): void {
    $user    = requireAuth();
    $body    = getBody();
    $current = $body['current_password'] ?? '';
    $new     = $body['new_password']     ?? '';
    if (strlen($new) < 8) jsonError('New password must be at least 8 characters');
    $db   = getDB();
    $stmt = $db->prepare("SELECT password FROM users WHERE id=?"); $stmt->execute([$user['id']]);
    $row  = $stmt->fetch();
    if (!password_verify($current, $row['password'])) jsonError('Current password is incorrect');
    $db->prepare("UPDATE users SET password=? WHERE id=?")->execute([password_hash($new,PASSWORD_BCRYPT),$user['id']]);
    $db->prepare("DELETE FROM sessions WHERE user_id=?")->execute([$user['id']]);
    jsonSuccess([], 'Password changed. Please log in again.');
}

function deactivateUser(): void {
    requireAdmin();
    $userId = (int)($_GET['id'] ?? 0);
    if (!$userId) jsonError('User ID required');
    getDB()->prepare("UPDATE users SET is_active=0 WHERE id=?")->execute([$userId]);
    jsonSuccess([], 'User deactivated');
}
