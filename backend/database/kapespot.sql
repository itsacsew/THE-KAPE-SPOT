-- Create database
CREATE DATABASE IF NOT EXISTS kapespot_db;
USE kapespot_db;

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    stocks INT DEFAULT 0,
    sales INT DEFAULT 0,
    status BOOLEAN DEFAULT TRUE,
    description TEXT,
    image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    size VARCHAR(50),
    stocks INT DEFAULT 0,
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT IGNORE INTO categories (name) VALUES 
('Fast Food'),
('Pizza'),
('Pasta'),
('Sandwich'),
('Beverages'),
('Dessert'),
('Main Course');

-- Insert sample menu items
INSERT IGNORE INTO items (code, name, price, category, stocks, sales, description) VALUES
('18754', 'Cheese Burst Sandwich', 12.00, 'Sandwich', 50, 112, 'Delicious cheese burst sandwich'),
('18755', 'Red Source Pasta', 12.00, 'Pasta', 30, 214, 'Pasta with red sauce'),
('18756', 'Sugar Free Coke', 3.00, 'Beverages', 100, 98, 'Sugar free carbonated drink'),
('18757', 'Cassata Vanilla Ice Cream', 8.00, 'Dessert', 25, 102, 'Vanilla ice cream dessert'),
('18758', 'Hamm Burger', 10.00, 'Fast Food', 40, 221, 'Classic hamburger'),
('18759', 'Roasted Chicken Legs', 15.00, 'Main Course', 20, 99, 'Juicy roasted chicken legs'),
('18760', 'Red Rose Juice', 5.00, 'Beverages', 60, 121, 'Refreshing rose juice');