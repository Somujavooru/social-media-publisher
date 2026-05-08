-- D1 Database Schema

DROP TABLE IF EXISTS PostPlatforms;
DROP TABLE IF EXISTS Posts;
DROP TABLE IF EXISTS Platforms;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Media;

CREATE TABLE Users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Platforms (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL, -- e.g., 'X', 'LinkedIn', 'Meta'
    credentials_ref TEXT NOT NULL, -- Reference to KV store key for encrypted tokens
    config TEXT, -- JSON configuration/options for the platform
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE Media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    file_url TEXT NOT NULL, -- R2 public or presigned URL
    type TEXT NOT NULL, -- 'image' or 'video'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE Posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media_id TEXT, -- Optional reference to Media
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'publishing', 'completed', 'failed'
    scheduled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES Media(id) ON DELETE SET NULL
);

CREATE TABLE PostPlatforms (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    platform_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'publishing', 'success', 'failed'
    response TEXT, -- JSON response from the platform API or error message
    FOREIGN KEY (post_id) REFERENCES Posts(id) ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES Platforms(id) ON DELETE CASCADE
);
