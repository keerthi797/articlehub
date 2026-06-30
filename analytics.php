<?php
require_once __DIR__ . '/helpers.php';
setCORSHeaders();

match ($_GET['action'] ?? '') {
    'overview'      => overview(),
    'active_groups' => activeGroups(),
    'top_articles'  => topArticles(),
    'user_activity' => userActivity(),
    default         => jsonError('Unknown action', 404),
};

function overview(): void {
    requireAdmin();
    $db    = getDB();
    $stats = [];
    $stats['total_views']          = (int)$db->query("SELECT COUNT(*) FROM article_views")->fetchColumn();
    $stats['articles_this_month']  = (int)$db->query("SELECT COUNT(*) FROM articles WHERE MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $stats['messages_this_month']  = (int)$db->query("SELECT COUNT(*) FROM messages WHERE is_deleted=0 AND MONTH(created_at)=MONTH(NOW()) AND YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $stats['active_users']         = (int)$db->query("SELECT COUNT(*) FROM users WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)")->fetchColumn();
    $stats['total_users']          = (int)$db->query("SELECT COUNT(*) FROM users WHERE is_active=1")->fetchColumn();
    $stats['total_groups']         = (int)$db->query("SELECT COUNT(*) FROM groups")->fetchColumn();
    $stats['total_reactions']      = (int)$db->query("SELECT COUNT(*) FROM reactions")->fetchColumn();
    jsonSuccess($stats);
}

function activeGroups(): void {
    requireAdmin();
    $stmt = getDB()->query("
        SELECT g.id, g.name,
               COUNT(DISTINCT a.id) AS article_count,
               COUNT(DISTINCT m.id) AS message_count,
               (COUNT(DISTINCT a.id)+COUNT(DISTINCT m.id)) AS activity_score
        FROM groups g
        LEFT JOIN articles a ON a.group_id=g.id
        LEFT JOIN messages m ON m.group_id=g.id AND m.is_deleted=0
        GROUP BY g.id, g.name ORDER BY activity_score DESC LIMIT 10
    ");
    jsonSuccess($stmt->fetchAll());
}

function topArticles(): void {
    requireAdmin();
    $limit = min((int)($_GET['limit'] ?? 10), 50);
    $stmt  = getDB()->prepare("
        SELECT a.id,a.article_title,a.article_url,a.source_name,a.created_at,
               u.name AS shared_by_name, g.name AS group_name,
               COUNT(av.id) AS view_count,
               (SELECT COUNT(*) FROM reactions r WHERE r.target_type='article' AND r.target_id=a.id) AS reaction_count
        FROM articles a
        JOIN users u ON u.id=a.shared_by
        JOIN groups g ON g.id=a.group_id
        LEFT JOIN article_views av ON av.article_id=a.id
        GROUP BY a.id ORDER BY view_count DESC LIMIT ?
    ");
    $stmt->execute([$limit]);
    jsonSuccess($stmt->fetchAll());
}

function userActivity(): void {
    requireAdmin();
    $stmt = getDB()->query("
        SELECT u.id,u.name,u.email,u.role,u.last_seen,
               (SELECT COUNT(*) FROM articles a WHERE a.shared_by=u.id) AS articles_shared,
               (SELECT COUNT(*) FROM messages m WHERE m.user_id=u.id AND m.is_deleted=0) AS messages_sent,
               (SELECT COUNT(*) FROM reactions r WHERE r.user_id=u.id) AS reactions_given
        FROM users u WHERE u.is_active=1 ORDER BY u.last_seen DESC
    ");
    jsonSuccess($stmt->fetchAll());
}
