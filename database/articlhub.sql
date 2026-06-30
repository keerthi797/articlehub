-- ============================================================
--  ArticleHub – Full Database Schema
--  Import this in phpMyAdmin or run via MySQL CLI
--  Database: articlhub2
-- ============================================================

CREATE DATABASE IF NOT EXISTS articlhub2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE articlhub2;

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE users (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)        NOT NULL,
    email       VARCHAR(150)        NOT NULL UNIQUE,
    password    VARCHAR(255)        NOT NULL,
    role        ENUM('admin','author') NOT NULL DEFAULT 'author',
    job_title   VARCHAR(100)        DEFAULT NULL,
    org         VARCHAR(150)        DEFAULT NULL,
    avatar      VARCHAR(255)        DEFAULT NULL,
    is_active   TINYINT(1)          NOT NULL DEFAULT 1,
    last_seen   DATETIME            DEFAULT NULL,
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── SESSIONS (token-based auth) ────────────────────────────
CREATE TABLE sessions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED        NOT NULL,
    token       VARCHAR(64)         NOT NULL UNIQUE,
    expires_at  DATETIME            NOT NULL,
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── GROUPS ─────────────────────────────────────────────────
CREATE TABLE groups (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100)        NOT NULL,
    description TEXT                DEFAULT NULL,
    created_by  INT UNSIGNED        NOT NULL,
    created_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── GROUP MEMBERS ───────────────────────────────────────────
CREATE TABLE group_members (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    group_id    INT UNSIGNED        NOT NULL,
    user_id     INT UNSIGNED        NOT NULL,
    joined_at   DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_group_user (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── ARTICLES ────────────────────────────────────────────────
CREATE TABLE articles (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    group_id        INT UNSIGNED        NOT NULL,
    shared_by       INT UNSIGNED        NOT NULL,
    article_url     TEXT                NOT NULL,
    article_title   VARCHAR(300)        DEFAULT NULL,
    thumbnail       TEXT                DEFAULT NULL,
    description     TEXT                DEFAULT NULL,
    source_name     VARCHAR(100)        DEFAULT NULL,
    is_pinned       TINYINT(1)          NOT NULL DEFAULT 0,
    is_forwarded    TINYINT(1)          NOT NULL DEFAULT 0,
    forwarded_from  INT UNSIGNED        DEFAULT NULL,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id)  REFERENCES groups(id)  ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── ARTICLE VIEWS ───────────────────────────────────────────
CREATE TABLE article_views (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    article_id  INT UNSIGNED        NOT NULL,
    user_id     INT UNSIGNED        NOT NULL,
    viewed_at   DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_article_user (article_id, user_id),
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── MESSAGES ────────────────────────────────────────────────
CREATE TABLE messages (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    group_id        INT UNSIGNED        NOT NULL,
    user_id         INT UNSIGNED        NOT NULL,
    message         TEXT                NOT NULL,
    reply_to        INT UNSIGNED        DEFAULT NULL,
    is_forwarded    TINYINT(1)          NOT NULL DEFAULT 0,
    is_edited       TINYINT(1)          NOT NULL DEFAULT 0,
    is_deleted      TINYINT(1)          NOT NULL DEFAULT 0,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id)  REFERENCES groups(id)   ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY (reply_to)  REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── MESSAGE SEEN STATUS ─────────────────────────────────────
CREATE TABLE message_seen (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id  INT UNSIGNED        NOT NULL,
    user_id     INT UNSIGNED        NOT NULL,
    seen_at     DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_msg_user (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── REACTIONS ───────────────────────────────────────────────
CREATE TABLE reactions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_type     ENUM('article','message') NOT NULL,
    target_id       INT UNSIGNED        NOT NULL,
    user_id         INT UNSIGNED        NOT NULL,
    reaction_type   VARCHAR(20)         NOT NULL,
    created_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reaction (target_type, target_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── NOTIFICATIONS ───────────────────────────────────────────
CREATE TABLE notifications (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED        NOT NULL,
    actor_id            INT UNSIGNED        DEFAULT NULL,
    notification_type   VARCHAR(50)         NOT NULL,
    reference_type      VARCHAR(50)         DEFAULT NULL,
    reference_id        INT UNSIGNED        DEFAULT NULL,
    message             TEXT                DEFAULT NULL,
    is_read             TINYINT(1)          NOT NULL DEFAULT 0,
    created_at          DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ── PINNED ARTICLES ─────────────────────────────────────────
-- (handled via articles.is_pinned flag above)

-- ============================================================
--  SEED DATA – Demo users & sample content
-- ============================================================

-- Passwords are bcrypt of: admin123, author123
INSERT INTO users (name, email, password, role, job_title, org) VALUES
('James Kim',   'admin@articlhub.com',  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',  'Editor in Chief', 'The Daily Chronicle'),
('Sarah Amir',  'author@articlhub.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'author', 'Senior Journalist', 'The Daily Chronicle'),
('Rohan Lal',   'rohan@articlhub.com',  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'author', 'Tech Reporter',    'The Daily Chronicle'),
('Maya Patel',  'maya@articlhub.com',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'author', 'Science Writer',   'The Daily Chronicle');

-- Groups
INSERT INTO groups (name, description, created_by) VALUES
('Tech & Innovation', 'AI, chips, startups and all things tech', 1),
('World News',        'International headlines and global affairs', 1),
('Science & Health',  'Scientific discoveries and health research', 1),
('Editorial Team',    'Internal editorial planning and discussion', 1),
('Politics & Policy', 'Political coverage and policy analysis', 1);

-- All users in all groups
INSERT INTO group_members (group_id, user_id) VALUES
(1,1),(1,2),(1,3),(1,4),
(2,1),(2,2),(2,3),
(3,1),(3,4),
(4,1),(4,2),(4,3),(4,4),
(5,1),(5,2),(5,3);

-- Sample articles
INSERT INTO articles (group_id, shared_by, article_url, article_title, thumbnail, description, source_name, is_pinned) VALUES
(1, 1, 'https://techcrunch.com/gpt5', 'OpenAI Unveils GPT-5 With Unprecedented Reasoning Capabilities', NULL, 'The latest model from OpenAI sets new benchmarks across reasoning, coding, and creative tasks.', 'TechCrunch', 1),
(1, 2, 'https://wired.com/tsmc-2nm', 'Inside the Chip Wars: TSMC\'s New 2nm Process', NULL, 'Taiwan Semiconductor\'s breakthrough 2nm fabrication process promises a 15% performance leap.', 'Wired', 0),
(2, 3, 'https://reuters.com/climate', 'UN Climate Summit Reaches Landmark Agreement on Carbon Emissions', NULL, 'World leaders ratified a binding framework committing 147 nations to cut greenhouse gas emissions by 45%.', 'Reuters', 0),
(1, 4, 'https://theverge.com/spacex', 'SpaceX Starship Completes First Crewed Mars Transit Simulation', NULL, 'SpaceX passed a critical milestone as Starship completed a 120-day crewed simulation in cis-lunar space.', 'The Verge', 0);

-- Sample messages
INSERT INTO messages (group_id, user_id, message) VALUES
(1, 1, 'Good morning team! Don\'t miss the GPT-5 article I pinned above.'),
(1, 2, 'Already on it! Drafting a comparison piece between GPT-5 and Gemini Ultra.'),
(1, 3, 'I forwarded the climate summit article here from World News group.'),
(1, 4, 'SpaceX article is up! Think this pairs well with our upcoming space tech series.');

-- Sample reactions
INSERT INTO reactions (target_type, target_id, user_id, reaction_type) VALUES
('article', 1, 2, '👍'), ('article', 1, 3, '👍'), ('article', 1, 4, '🔥'),
('article', 3, 1, '👏'), ('article', 3, 2, '👏'), ('article', 3, 3, '❤️');

-- Sample notifications
INSERT INTO notifications (user_id, actor_id, notification_type, reference_type, reference_id, message) VALUES
(1, 2, 'reply',       'message', 2, 'Sarah Amir replied to your message'),
(1, 1, 'pin',         'article', 1, 'James Kim pinned an article in Tech & Innovation'),
(2, 1, 'group_invite','group',   2, 'You were added to World News by James Kim'),
(3, 4, 'reaction',    'article', 4, 'Maya Patel reacted 🔥 to your article share');

-- ── SETTINGS (System-wide configuration) ────────────────────
CREATE TABLE settings (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setting_key     VARCHAR(100)        NOT NULL UNIQUE,
    setting_value   TEXT                NOT NULL,
    description     VARCHAR(255)        DEFAULT NULL,
    updated_at      DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Default settings
INSERT INTO settings (setting_key, setting_value, description) VALUES
('allow_author_filter', '1', 'Allow users to filter articles by author (1=yes, 0=no)');
