CREATE DATABASE IF NOT EXISTS ems_db_new
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE ems_db_new;

CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS designations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS employees (
    employee_id VARCHAR(20) PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    department_id INT NOT NULL,
    designation_id INT NOT NULL,
    salary DECIMAL(12, 2) NOT NULL,
    date_of_birth DATE NOT NULL,
    address VARCHAR(255) NOT NULL,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (designation_id) REFERENCES designations(id)
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'employee') NOT NULL,
    employee_id VARCHAR(20) NULL UNIQUE,
    admin_guard TINYINT GENERATED ALWAYS AS (
        CASE WHEN role = 'admin' THEN 1 ELSE NULL END
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_one_admin (admin_guard),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    leave_type ENUM('Casual Leave','Sick Leave','Annual Leave','Other') NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status ENUM('Pending', 'Approved', 'Declined', 'Cancelled') DEFAULT 'Pending',
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL,
    attendance_date DATE NOT NULL,
    check_in DATETIME NULL,
    check_out DATETIME NULL,
    status ENUM('Present', 'Incomplete') NOT NULL DEFAULT 'Incomplete',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_employee_attendance_day (employee_id, attendance_date),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
);

INSERT IGNORE INTO departments (name)
VALUES ('IT'),('HR'),('Finance'),('Design'),('Sales'),('Marketing'),('Operations');

INSERT IGNORE INTO designations (name)
VALUES ('Developer'),('HR Manager'),('Accountant'),('Designer'),('Sales Executive'),('Team Lead'),('Analyst');

-- Existing database upgrade:
-- If leave_requests already exists, run:
-- ALTER TABLE leave_requests MODIFY status
-- ENUM('Pending','Approved','Declined','Cancelled') DEFAULT 'Pending';
-- Then run the CREATE TABLE attendance statement above separately.
