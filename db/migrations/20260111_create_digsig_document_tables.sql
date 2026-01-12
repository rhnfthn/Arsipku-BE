-- =============================================
-- DIGSIG DOCUMENT TABLES
-- Untuk fitur "Penandatanganan" di menu Digsig
-- Created: 2026-01-11
-- =============================================

CREATE TABLE IF NOT EXISTS digsig_document (
  id VARCHAR(36) PRIMARY KEY,
  
  tanggal_dokumen DATE NOT NULL,
  klasifikasi VARCHAR(50),
  klasifikasi_text VARCHAR(255),
  jenis_naskah VARCHAR(50) NOT NULL,
  nomor_dokumen VARCHAR(150) NOT NULL,
  perihal TEXT,
  
  file_path VARCHAR(500),
  file_name VARCHAR(255),
  file_size INT,
  file_mime_type VARCHAR(100),
  
  signed_file_path VARCHAR(500),
  signed_file_name VARCHAR(255),
  
  visible_sign TINYINT(1) DEFAULT 0,
  
  status ENUM('draft', 'on_progress', 'completed', 'rejected', 'cancelled') DEFAULT 'draft',
  current_signer_order INT DEFAULT 1,
  total_signers INT DEFAULT 0,
  
  rejected_by INT,
  rejected_at DATETIME,
  rejection_reason TEXT,
  
  created_by INT NOT NULL,
  created_by_name VARCHAR(255),
  created_by_position VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_created_by (created_by),
  INDEX idx_tanggal (tanggal_dokumen),
  INDEX idx_jenis (jenis_naskah),
  INDEX idx_nomor (nomor_dokumen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digsig_document_signer (
  id VARCHAR(36) PRIMARY KEY,
  id_document VARCHAR(36) NOT NULL,
  
  urutan INT NOT NULL,
  
  persnum INT NOT NULL,
  nama VARCHAR(255),
  jabatan VARCHAR(255),
  position_id INT,
  
  status ENUM('pending', 'waiting', 'signed', 'rejected') DEFAULT 'pending',
  
  signed_at DATETIME,
  signature_id VARCHAR(100),
  bsre_doc_id VARCHAR(100),
  bsre_name_doc VARCHAR(255),
  
  rejected_at DATETIME,
  keterangan TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_signer_document FOREIGN KEY (id_document) 
    REFERENCES digsig_document(id) ON DELETE CASCADE,
  
  INDEX idx_document (id_document),
  INDEX idx_persnum (persnum),
  INDEX idx_status (status),
  INDEX idx_urutan (id_document, urutan),
  
  UNIQUE KEY uk_document_persnum (id_document, persnum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CONTOH DATA (opsional, untuk testing)
-- =============================================
-- INSERT INTO digsig_document (id, tanggal_dokumen, klasifikasi, jenis_naskah, nomor_dokumen, perihal, status, created_by)
-- VALUES (UUID(), '2026-01-11', 'OPS', 'PGM', '123/TEST', 'Testing Digital Signature', 'on_progress', 10010118);
