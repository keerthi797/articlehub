<?php
// helpers.php  ← sits in root of article-dashboard/

require_once __DIR__ . '/db.php';

// ── CORS ──────────────────────────────────────────────────
function setCORSHeaders(): void {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    header("Content-Type: application/json; charset=utf-8");
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
}

// ── RESPONSES ─────────────────────────────────────────────
function jsonSuccess(mixed $data = [], string $message = 'OK', int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success'=>true, 'message'=>$message, 'data'=>$data]);
    exit;
}

function jsonError(string $message, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success'=>false, 'message'=>$message, 'data'=>null]);
    exit;
}

// ── GET JSON BODY ─────────────────────────────────────────
function getBody(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// ── TOKEN GENERATOR ───────────────────────────────────────
function generateToken(): string {
    return bin2hex(random_bytes(32));
}

// ── AUTH CHECK ────────────────────────────────────────────
function requireAuth(): array {
    $headers    = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if (!str_starts_with($authHeader, 'Bearer ')) jsonError('Unauthorised – missing token', 401);

    $token = substr($authHeader, 7);
    $db    = getDB();
    $stmt  = $db->prepare("
        SELECT u.id, u.name, u.email, u.role, u.job_title, u.org, u.avatar
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = 1
    ");
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) jsonError('Unauthorised – invalid or expired token', 401);

    $db->prepare("UPDATE users SET last_seen = NOW() WHERE id = ?")->execute([$user['id']]);
    return $user;
}

function requireAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'admin') jsonError('Forbidden – admin only', 403);
    return $user;
}

// ── GROUP MEMBERSHIP CHECK ────────────────────────────────
function isMember(int $groupId, int $userId): bool {
    $stmt = getDB()->prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?");
    $stmt->execute([$groupId, $userId]);
    return (bool)$stmt->fetch();
}

// ── CREATE NOTIFICATION ───────────────────────────────────
function createNotification(int $userId, ?int $actorId, string $type, string $refType, int $refId, string $message): void {
    if ($userId === $actorId) return;
    getDB()->prepare("
        INSERT INTO notifications (user_id, actor_id, notification_type, reference_type, reference_id, message)
        VALUES (?,?,?,?,?,?)
    ")->execute([$userId, $actorId, $type, $refType, $refId, $message]);
}

// ── FETCH OPENGRAPH META ──────────────────────────────────
function fetchOgMeta(string $url): array {
    $meta = ['title'=>'', 'description'=>'', 'image'=>'', 'source'=>''];
    $host = parse_url($url, PHP_URL_HOST) ?? '';
    $meta['source'] = strtoupper(preg_replace('/^www\./', '', $host));

    $ctx  = stream_context_create(['http'=>[
        'timeout'         => 5,
        'follow_location' => 1,
        'max_redirects'   => 3,
        'user_agent'      => 'Mozilla/5.0 ArticleHub/1.0',
    ]]);
    $html = @file_get_contents($url, false, $ctx);
    if (!$html) return $meta;

    if (preg_match('/<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']/is', $html, $m))
        $meta['title'] = html_entity_decode($m[1], ENT_QUOTES);
    elseif (preg_match('/<title>(.*?)<\/title>/is', $html, $m))
        $meta['title'] = html_entity_decode(strip_tags($m[1]), ENT_QUOTES);

    if (preg_match('/<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']/is', $html, $m))
        $meta['description'] = html_entity_decode($m[1], ENT_QUOTES);

    if (preg_match('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']/is', $html, $m))
        $meta['image'] = $m[1];

    return $meta;
}
