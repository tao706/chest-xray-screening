CREATE DATABASE IF NOT EXISTS chest_xray
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE chest_xray;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_pk BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_pk) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_expires_at (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS studies (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  subject_id VARCHAR(64) NOT NULL,
  study_id VARCHAR(64) NOT NULL,
  note VARCHAR(300) NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  image_count INT UNSIGNED NOT NULL DEFAULT 0,
  model_version VARCHAR(64) NULL,
  inference_time_ms DECIMAL(12, 3) NULL,
  total_time_ms DECIMAL(12, 3) NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_studies_study_id (study_id),
  KEY idx_studies_subject_id (subject_id),
  KEY idx_studies_status (status),
  KEY idx_studies_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS study_images (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  study_pk BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NULL,
  stored_path VARCHAR(500) NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_study_images_study
    FOREIGN KEY (study_pk) REFERENCES studies(id)
    ON DELETE CASCADE,
  KEY idx_study_images_study_pk (study_pk)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS predictions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  study_pk BIGINT UNSIGNED NOT NULL,
  class_id TINYINT UNSIGNED NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  class_name_en VARCHAR(100) NOT NULL,
  probability DECIMAL(9, 8) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_predictions_study
    FOREIGN KEY (study_pk) REFERENCES studies(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_predictions_class_id CHECK (class_id BETWEEN 1 AND 14),
  CONSTRAINT chk_predictions_probability CHECK (probability BETWEEN 0 AND 1),
  UNIQUE KEY uk_predictions_study_class (study_pk, class_id),
  KEY idx_predictions_class_id (class_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clinical_review_drafts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  review_id CHAR(36) NOT NULL,
  study_pk BIGINT UNSIGNED NOT NULL,
  author_user_pk BIGINT UNSIGNED NOT NULL,
  clinical_info_json JSON NOT NULL,
  sections_json JSON NOT NULL,
  status ENUM('draft', 'reviewed_demo') NOT NULL DEFAULT 'draft',
  model_version VARCHAR(64) NOT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clinical_review_study FOREIGN KEY (study_pk) REFERENCES studies(id) ON DELETE CASCADE,
  CONSTRAINT fk_clinical_review_author FOREIGN KEY (author_user_pk) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_clinical_review_id (review_id),
  KEY idx_clinical_review_study_author (study_pk, author_user_pk, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batch_tasks (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(64) NOT NULL,
  task_name VARCHAR(100) NOT NULL,
  dataset_name VARCHAR(100) NOT NULL,
  status ENUM('pending', 'scanning', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  threshold_value DECIMAL(4, 3) NOT NULL DEFAULT 0.500,
  total_count INT UNSIGNED NOT NULL DEFAULT 0,
  completed_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  csv_path VARCHAR(500) NULL,
  error_message VARCHAR(500) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_batch_tasks_task_id (task_id),
  KEY idx_batch_tasks_status (status),
  KEY idx_batch_tasks_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batch_task_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_pk BIGINT UNSIGNED NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  study_id VARCHAR(64) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  image_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_task_items_task
    FOREIGN KEY (task_pk) REFERENCES batch_tasks(id)
    ON DELETE CASCADE,
  UNIQUE KEY uk_batch_task_item_study (task_pk, study_id),
  KEY idx_batch_task_items_status (status)
) ENGINE=InnoDB;

