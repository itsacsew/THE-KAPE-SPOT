<?php
// config.php
function setCORSHeaders()
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
        exit(0);
    }
}

function getDBConnection()
{
    $host = 'localhost';
    $dbname = 'kapespot_db';  // Palihug i-check ang database name
    $username = 'root';     // Palihug i-check ang username
    $password = '';     // Palihug i-check ang password

    try {
        $conn = new mysqli($host, $username, $password, $dbname);

        if ($conn->connect_error) {
            throw new Exception('Database connection failed: ' . $conn->connect_error);
        }

        return $conn;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        exit;
    }
}
