# ArticleHub

A lightweight editorial collaboration dashboard where teams can share articles, chat in real time, and manage group workspaces — all in one place.

# What it does

ArticleHub lets journalists, editors, and content teams stay on the same page. Members join groups, share article links for discussion, and chat — with admins controlling access and settings.

#Core features

- Share article links with rich previews (title, image, source) inside group channels
- Real-time group chat with reply, edit, delete, and emoji reactions
- Pin important articles to the top of a channel
- Forward articles or messages to other groups
- Notifications for replies, reactions, pins, and group invites
- Global and channel-level search across articles, messages, and members
- Admin panel — create groups, manage members, promote users, view analytics
- Light and dark mode
- Mobile responsive

# Roles

| Role | What they can do |
|------|-----------------|
| Author | Join groups, share articles, chat, react, forward |
| Admin | Everything above + create/delete groups, manage members, promote users, access analytics |

Everyone signs up as an Author. Admins are promoted through the admin panel — users cannot self-select a role.

# Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JS |
| Backend | PHP (XAMPP / Apache) |
| Database | MySQL |
| Icons | Tabler Icons |
| Fonts | Syne, DM Sans (Google Fonts) |

# Getting started

Requirements: XAMPP (Apache + MySQL) or any PHP 7.4+ server with MySQL.

1. Clone the repo
  
2. Move the folder into your XAMPP `htdocs` directory
   
   htdocs/articlehub/   

3. Import the database — open phpMyAdmin and import `database/articlehub.sql`

4. Start Apache and MySQL from the XAMPP control panel

5. Open your browser and go to  http://localhost/articlehub/auth.html

# Demo accounts

| Email | Password | Role |
|-------|----------|------|
| admin@articlhub.com | admin123 | Admin |
| author@articlhub.com | author123 | Author |

articlehub/
├── auth.html              # Login and signup
├── index.html             # Main dashboard (authors)
├── admin.html             # Admin panel
├── auth.php               # Login, register, logout
├── groups.php             # Group management
├── messages.php           # Chat
├── articles.php           # Article sharing
├── reactions.php          # Emoji reactions
├── notifications.php      # Notification system
├── analytics.php          # Usage analytics
├── users.php              # User management
├── settings.php           # App settings
├── js/
│   ├── api.js             # Centralised API layer
│   └── app.js             # Main app logic
└── database/
    └── articlehub.sql     # Database schema and seed data
# License

MIT