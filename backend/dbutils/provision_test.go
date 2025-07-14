package dbutils

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

const (
	testDBName = "testdb_provision"
)

var (
	testUser = "testuser_provision_" + uuid.New().String()[:8]
)

// TestMain manages the setup and teardown of the test database.
func TestMain(m *testing.M) {
	// Setup: Create a test database
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		fmt.Println("PG_ADMIN_DSN not set, skipping tests")
		os.Exit(0)
	}

	err := CreatePostgresDatabase(adminDSN, testDBName)
	if err != nil {
		fmt.Printf("Failed to create test database: %v", err)
		// Cleanup in case the DB was created but something else failed
		cleanup(adminDSN)
		os.Exit(1)
	}

	// Run the tests
	code := m.Run()

	// Teardown: Drop the test database
	cleanup(adminDSN)

	os.Exit(code)
}

func cleanup(adminDSN string) {
	adminDB, err := connectToDB(adminDSN)
	if err != nil {
		fmt.Printf("Failed to connect to admin DB for cleanup: %v", err)
		return
	}
	defer adminDB.Close()

	// Add a small delay to ensure connections are closed before dropping
	time.Sleep(1 * time.Second)

	_, err = adminDB.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s", testDBName))
	if err != nil {
		fmt.Printf("Failed to drop test database: %v", err)
	}
}

// getUserDSN constructs a DSN for a given user and database.
func getUserDSN(t *testing.T, username, password, dbName string) string {
	pgHost := os.Getenv("PG_HOST")
	if pgHost == "" {
		t.Skip("PG_HOST not set, skipping test")
	}
	encodedPassword := url.QueryEscape(password)
	return fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=disable", username, encodedPassword, pgHost, dbName)
}

// TestUserPermissions verifies that a created user can perform the actions they are granted.
func TestUserPermissions(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// 1. Create a user with 'write' permissions
	password, err := CreatePostgresUser(adminDSN, testDBName, testUser, "write")
	if err != nil {
		t.Fatalf("Failed to create postgres user: %v", err)
	}

	userDSN := getUserDSN(t, testUser, password, testDBName)

	userDB, err := connectToDB(userDSN)
	if err != nil {
		t.Fatalf("Failed to connect to test DB as new user: %v", err)
	}
	defer userDB.Close()

	// 3. Perform database operations
	// Create table
	_, err = userDB.Exec("CREATE TABLE test_table (id INT, name VARCHAR(50))")
	if err != nil {
		t.Fatalf("User failed to create table: %v", err)
	}

	// Insert data
	_, err = userDB.Exec("INSERT INTO test_table (id, name) VALUES (1, 'test')")
	if err != nil {
		t.Fatalf("User failed to insert data: %v", err)
	}

	// Select data
	var name string
	err = userDB.QueryRow("SELECT name FROM test_table WHERE id = 1").Scan(&name)
	if err != nil {
		t.Fatalf("User failed to select data: %v", err)
	}
	if name != "test" {
		t.Errorf("Expected name 'test', got '%s'", name)
	}

	// Drop table
	_, err = userDB.Exec("DROP TABLE test_table")
	if err != nil {
		t.Fatalf("User failed to drop table: %v", err)
	}

	// 4. Cleanup the user
	err = DeletePostgresUser(adminDSN, testDBName, testUser)
	if err != nil {
		t.Fatalf("Failed to delete postgres user: %v", err)
	}
}

// TestUserPermissionsAndIsolation verifies read/write permissions and database isolation.
func TestUserPermissionsAndIsolation(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// Generate unique names for users and a second database
	readUser := "readuser_" + uuid.New().String()[:8]
	writeUser := "writeuser_" + uuid.New().String()[:8]
	testDBName2 := "testdb_provision_2_" + uuid.New().String()[:8]

	// --- Setup --- //
	// Create the second test database
	err := CreatePostgresDatabase(adminDSN, testDBName2)
	if err != nil {
		t.Fatalf("Failed to create second test database %s: %v", testDBName2, err)
	}

	// Create a dummy table in testDBName2 using admin user to test data isolation
	adminDB2, err := connectToDB(getUserDSN(t, "test_admin", "test_password", testDBName2))
	if err != nil {
		t.Fatalf("Failed to connect to %s as admin for dummy table creation: %v", testDBName2, err)
	}
	_, err = adminDB2.Exec("CREATE TABLE isolated_test_table (id INT, data TEXT)")
	if err != nil {
		t.Fatalf("Failed to create isolated_test_table in %s: %v", testDBName2, err)
	}
	_, err = adminDB2.Exec("INSERT INTO isolated_test_table (id, data) VALUES (1, 'secret_data')")
	if err != nil {
		t.Fatalf("Failed to insert data into isolated_test_table in %s: %v", testDBName2, err)
	}

	// Create read-only user in testDBName
	readPassword, err := CreatePostgresUser(adminDSN, testDBName, readUser, "read")
	if err != nil {
		t.Fatalf("Failed to create read user %s: %v", readUser, err)
	}

	// Create write user in testDBName
	writePassword, err := CreatePostgresUser(adminDSN, testDBName, writeUser, "write")
	if err != nil {
		t.Fatalf("Failed to create write user %s: %v", writeUser, err)
	}

	// --- Test Read User Permissions --- //
	t.Run("ReadUserPermissions", func(t *testing.T) {
		readUserDSN := getUserDSN(t, readUser, readPassword, testDBName)
		readDB, err := connectToDB(readUserDSN)
		if err != nil {
			t.Fatalf("Failed to connect to %s as read user %s: %v", testDBName, readUser, err)
		}
		defer readDB.Close()

		// Verify SELECT is allowed (after creating a table with write user)
		_, err = readDB.Exec("CREATE TABLE IF NOT EXISTS read_test_table (id INT)")
		if err == nil {
			t.Error("Read user should NOT be able to create table")
		}

		// Verify INSERT is NOT allowed
		_, err = readDB.Exec("INSERT INTO read_test_table (id) VALUES (1)")
		if err == nil {
			t.Error("Read user should NOT be able to insert data")
		}

		// Verify UPDATE is NOT allowed
		_, err = readDB.Exec("UPDATE read_test_table SET id = 2 WHERE id = 1")
		if err == nil {
			t.Error("Read user should NOT be able to update data")
		}

		// Verify DELETE is NOT allowed
		_, err = readDB.Exec("DELETE FROM read_test_table WHERE id = 1")
		if err == nil {
			t.Error("Read user should NOT be able to delete data")
		}
	})

	// --- Test Write User Permissions --- //
	t.Run("WriteUserPermissions", func(t *testing.T) {
		writeUserDSN := getUserDSN(t, writeUser, writePassword, testDBName)
		writeDB, err := connectToDB(writeUserDSN)
		if err != nil {
			t.Fatalf("Failed to connect to %s as write user %s: %v", testDBName, writeUser, err)
		}
		defer writeDB.Close()

		// Verify CREATE TABLE is allowed
		_, err = writeDB.Exec("CREATE TABLE write_test_table (id INT, name VARCHAR(50))")
		if err != nil {
			t.Fatalf("Write user failed to create table: %v", err)
		}

		// Verify INSERT is allowed
		_, err = writeDB.Exec("INSERT INTO write_test_table (id, name) VALUES (1, 'test_write')")
		if err != nil {
			t.Fatalf("Write user failed to insert data: %v", err)
		}

		// Verify SELECT is allowed
		var name string
		err = writeDB.QueryRow("SELECT name FROM write_test_table WHERE id = 1").Scan(&name)
		if err != nil {
			t.Fatalf("Write user failed to select data: %v", err)
		}
		if name != "test_write" {
			t.Errorf("Expected name 'test_write', got '%s'", name)
		}

		// Verify UPDATE is allowed
		_, err = writeDB.Exec("UPDATE write_test_table SET name = 'updated_write' WHERE id = 1")
		if err != nil {
			t.Fatalf("Write user failed to update data: %v", err)
		}

		// Verify DELETE is allowed
		_, err = writeDB.Exec("DELETE FROM write_test_table WHERE id = 1")
		if err != nil {
			t.Fatalf("Write user failed to delete data: %v", err)
		}

		// Verify CREATE INDEX is allowed
		_, err = writeDB.Exec("CREATE INDEX idx_write_test ON write_test_table(id)")
		if err != nil {
			t.Fatalf("Write user failed to create index: %v", err)
		}

		// Verify DROP INDEX is allowed
		_, err = writeDB.Exec("DROP INDEX idx_write_test")
		if err != nil {
			t.Fatalf("Write user failed to drop index: %v", err)
		}

		// Clean up table
		_, err = writeDB.Exec("DROP TABLE write_test_table")
		if err != nil {
			t.Fatalf("Write user failed to drop table: %v", err)
		}
	})

	// --- Test Database Isolation --- //
	t.Run("DatabaseIsolation", func(t *testing.T) {
		// Attempt to connect read user to testDBName2
		readUserDSN2 := getUserDSN(t, readUser, readPassword, testDBName2)
		readDB2, err := connectToDB(readUserDSN2)
		if err == nil {
			defer readDB2.Close() // Ensure connection is closed
			// If connection succeeded, try to query from isolated_test_table to confirm lack of access
			var data string
			queryErr := readDB2.QueryRow("SELECT data FROM isolated_test_table LIMIT 1").Scan(&data)
			if queryErr == nil {
				t.Errorf("Read user %s unexpectedly queried data from isolated_test_table in %s: %s", readUser, testDBName2, data)
			} else if !strings.Contains(queryErr.Error(), "permission denied") && !strings.Contains(queryErr.Error(), "access denied") && !strings.Contains(queryErr.Error(), "does not exist") && !strings.Contains(queryErr.Error(), "relation 'isolated_test_table' does not exist") {
				t.Errorf("Read user %s query on isolated_test_table in %s failed with unexpected error: %v", readUser, testDBName2, queryErr)
			}
		} else if !strings.Contains(err.Error(), "permission denied") && !strings.Contains(err.Error(), "does not exist") && !strings.Contains(err.Error(), "FATAL:  database") {
			t.Errorf("Read user %s connection to %s failed with unexpected error: %v", readUser, testDBName2, err)
		}

		// Attempt to connect write user to testDBName2
		writeUserDSN2 := getUserDSN(t, writeUser, writePassword, testDBName2)
		writeDB2, err := connectToDB(writeUserDSN2)
		if err == nil {
			defer writeDB2.Close() // Ensure connection is closed
			// If connection succeeded, try to query from isolated_test_table to confirm lack of access
			var data string
			queryErr := writeDB2.QueryRow("SELECT data FROM isolated_test_table LIMIT 1").Scan(&data)
			if queryErr == nil {
				t.Errorf("Write user %s unexpectedly queried data from isolated_test_table in %s: %s", writeUser, testDBName2, data)
			} else if !strings.Contains(queryErr.Error(), "permission denied") && !strings.Contains(queryErr.Error(), "access denied") && !strings.Contains(queryErr.Error(), "does not exist") && !strings.Contains(queryErr.Error(), "relation 'isolated_test_table' does not exist") {
				t.Errorf("Write user %s query on isolated_test_table in %s failed with unexpected error: %v", writeUser, testDBName2, queryErr)
			}
		} else if !strings.Contains(err.Error(), "permission denied") && !strings.Contains(err.Error(), "does not exist") && !strings.Contains(err.Error(), "FATAL:  database") {
			t.Errorf("Write user %s connection to %s failed with unexpected error: %v", writeUser, testDBName2, err)
		}
	})

	// --- Teardown --- //
	// Delete users
	err = DeletePostgresUser(adminDSN, testDBName, readUser)
	if err != nil {
		t.Errorf("Failed to delete read user %s: %v", readUser, err)
	}
	err = DeletePostgresUser(adminDSN, testDBName, writeUser)
	if err != nil {
		t.Errorf("Failed to delete write user %s: %v", writeUser, err)
	}

	// Close adminDB2 connection before dropping the database
	adminDB2.Close()

	// Add a small delay to ensure connections are closed before dropping
	time.Sleep(1 * time.Second)

	// Drop the second test database
	adminDB, err := connectToDB(adminDSN)
	if err != nil {
		t.Fatalf("Failed to connect to admin DB for cleanup: %v", err)
	}
	defer adminDB.Close()

	_, err = adminDB.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %s", testDBName2))
	if err != nil {
		t.Errorf("Failed to drop second test database %s: %v", testDBName2, err)
	}
}

// TestUserCannotCreateOrDropDB verifies that a user with 'write' permissions cannot create or drop databases.
func TestUserCannotCreateOrDropDB(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// 1. Create a user with 'write' permissions
	password, err := CreatePostgresUser(adminDSN, testDBName, testUser, "write")
	if err != nil {
		t.Fatalf("Failed to create postgres user: %v", err)
	}

	userDSN := getUserDSN(t, testUser, password, testDBName)

	userDB, err := connectToDB(userDSN)
	if err != nil {
		t.Fatalf("Failed to connect to test DB as new user: %v", err)
	}
	defer userDB.Close()

	// 2. Attempt to create a database (should fail)
	_, err = userDB.Exec("CREATE DATABASE should_not_be_created_db")
	if err == nil {
		t.Fatal("User should not be able to create a database")
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("Expected 'permission denied' error, got: %v", err)
	}

	// 3. Attempt to drop a database (should fail)
	_, err = userDB.Exec(fmt.Sprintf("DROP DATABASE %s", testDBName))
	if err == nil {
		t.Fatal("User should not be able to drop a database")
	}
	if !strings.Contains(err.Error(), "must be owner of database") {
		t.Errorf("Expected 'must be owner of database' error, got: %v", err)
	}

	// 4. Cleanup the user
	err = DeletePostgresUser(adminDSN, testDBName, testUser)
	if err != nil {
		t.Fatalf("Failed to delete postgres user: %v", err)
	}
}

// TestUserCanCreateTable verifies a user with 'write' permissions can create and delete tables.
func TestUserCanCreateTable(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// 1. Create a user with 'write' permissions
	testUser := "writeuser_createtable_" + uuid.New().String()[:8]
	password, err := CreatePostgresUser(adminDSN, testDBName, testUser, "write")
	if err != nil {
		t.Fatalf("Failed to create postgres user: %v", err)
	}

	// Defer user deletion
	defer func() {
		err := DeletePostgresUser(adminDSN, testDBName, testUser)
		if err != nil {
			t.Errorf("Failed to delete postgres user %s: %v", testUser, err)
		}
	}()

	userDSN := getUserDSN(t, testUser, password, testDBName)

	userDB, err := connectToDB(userDSN)
	if err != nil {
		t.Fatalf("Failed to connect to test DB as new user: %v", err)
	}
	defer userDB.Close()

	// 2. Create a table
	tableName := "test_table_creation"
	_, err = userDB.Exec(fmt.Sprintf("CREATE TABLE %s (id INT)", tableName))
	if err != nil {
		t.Fatalf("User failed to create table: %v", err)
	}

	// 3. Drop the table
	_, err = userDB.Exec(fmt.Sprintf("DROP TABLE %s", tableName))
	if err != nil {
		t.Fatalf("User failed to drop table: %v", err)
	}
}

// TestReadUserCanReadWriteUserData verifies that a read user can select data created by a write user.
func TestReadUserCanReadWriteUserData(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// Generate unique names for users
	readUser := "readuser_shared_" + uuid.New().String()[:8]
	writeUser := "writeuser_shared_" + uuid.New().String()[:8]

	// 1. Create a write user and a read user
	writePassword, err := CreatePostgresUser(adminDSN, testDBName, writeUser, "write")
	if err != nil {
		t.Fatalf("Failed to create write user %s: %v", writeUser, err)
	}
	readPassword, err := CreatePostgresUser(adminDSN, testDBName, readUser, "read")
	if err != nil {
		t.Fatalf("Failed to create read user %s: %v", readUser, err)
	}

	// Defer user deletion
	defer func() {
		if err := DeletePostgresUser(adminDSN, testDBName, writeUser); err != nil {
			t.Errorf("Failed to delete write user %s: %v", writeUser, err)
		}
		if err := DeletePostgresUser(adminDSN, testDBName, readUser); err != nil {
			t.Errorf("Failed to delete read user %s: %v", readUser, err)
		}
	}()

	// 2. Write user connects and creates data
	writeUserDSN := getUserDSN(t, writeUser, writePassword, testDBName)
	writeDB, err := connectToDB(writeUserDSN)
	if err != nil {
		t.Fatalf("Failed to connect to %s as write user %s: %v", testDBName, writeUser, err)
	}
	defer writeDB.Close()

	tableName := "shared_data_table"
	_, err = writeDB.Exec(fmt.Sprintf("CREATE TABLE %s (id INT, data TEXT)", tableName))
	if err != nil {
		t.Fatalf("Write user failed to create table: %v", err)
	}
	defer writeDB.Exec(fmt.Sprintf("DROP TABLE %s", tableName)) // Defer cleanup

	_, err = writeDB.Exec(fmt.Sprintf("INSERT INTO %s (id, data) VALUES (1, 'shared_content')", tableName))
	if err != nil {
		t.Fatalf("Write user failed to insert data: %v", err)
	}

	// 3. A second write user connects and should be able to read, write, and create.
	writeUser2 := "writeuser2_shared_" + uuid.New().String()[:8]
	writePassword2, err := CreatePostgresUser(adminDSN, testDBName, writeUser2, "write")
	if err != nil {
		t.Fatalf("Failed to create second write user %s: %v", writeUser2, err)
	}
	defer func() {
		if err := DeletePostgresUser(adminDSN, testDBName, writeUser2); err != nil {
			t.Errorf("Failed to delete second write user %s: %v", writeUser2, err)
		}
	}()

	writeUser2DSN := getUserDSN(t, writeUser2, writePassword2, testDBName)
	writeDB2, err := connectToDB(writeUser2DSN)
	if err != nil {
		t.Fatalf("Failed to connect as second write user %s: %v", writeUser2, err)
	}
	defer writeDB2.Close()

	var data string
	// Verify second write user can read data from the first user's table
	err = writeDB2.QueryRow(fmt.Sprintf("SELECT data FROM %s WHERE id = 1", tableName)).Scan(&data)
	if err != nil {
		t.Fatalf("Second write user failed to select data: %v", err)
	}
	if data != "shared_content" {
		t.Errorf("Second write user expected 'shared_content', got '%s'", data)
	}

	// Verify second write user can insert data into the first user's table
	_, err = writeDB2.Exec(fmt.Sprintf("INSERT INTO %s (id, data) VALUES (2, 'more_shared_content')", tableName))
	if err != nil {
		t.Fatalf("Second write user failed to insert data: %v", err)
	}

	// Verify second write user can create a new table
	tableName2 := "second_write_user_table"
	_, err = writeDB2.Exec(fmt.Sprintf("CREATE TABLE %s (id INT)", tableName2))
	if err != nil {
		t.Fatalf("Second write user failed to create a new table: %v", err)
	}

	// 4. Read user connects and reads the data
	readUserDSN := getUserDSN(t, readUser, readPassword, testDBName)
	readDB, err := connectToDB(readUserDSN)
	if err != nil {
		t.Fatalf("Failed to connect to %s as read user %s: %v", testDBName, readUser, err)
	}
	defer readDB.Close()

	err = readDB.QueryRow(fmt.Sprintf("SELECT data FROM %s WHERE id = 1", tableName)).Scan(&data)
	if err != nil {
		t.Fatalf("Read user failed to select data from %s: %v", tableName, err)
	}

	if data != "shared_content" {
		t.Errorf("Expected data 'shared_content', got '%s'", data)
	}

	err = readDB.QueryRow(fmt.Sprintf("SELECT data FROM %s WHERE id = 2", tableName)).Scan(&data)
	if err != nil {
		t.Fatalf("Read user failed to select data from %s: %v", tableName, err)
	}

	if data != "more_shared_content" {
		t.Errorf("Expected data 'more_shared_content', got '%s'", data)
	}
	defer writeDB2.Exec(fmt.Sprintf("DROP TABLE %s", tableName2))
}

// TestExtensions verifies that the uuid-ossp and vector extensions are available and functional.
func TestExtensions(t *testing.T) {
	adminDSN := os.Getenv("PG_ADMIN_DSN")
	if adminDSN == "" {
		t.Skip("PG_ADMIN_DSN not set, skipping test")
	}

	// Create a user with 'write' permissions
	extTestUser := "extuser_" + uuid.New().String()[:8]
	password, err := CreatePostgresUser(adminDSN, testDBName, extTestUser, "write")
	if err != nil {
		t.Fatalf("Failed to create postgres user for extension test: %v", err)
	}
	defer func() {
		err := DeletePostgresUser(adminDSN, testDBName, extTestUser)
		if err != nil {
			t.Errorf("Failed to delete extension test user %s: %v", extTestUser, err)
		}
	}()

	userDSN := getUserDSN(t, extTestUser, password, testDBName)
	userDB, err := connectToDB(userDSN)
	if err != nil {
		t.Fatalf("Failed to connect to test DB as extension test user: %v", err)
	}
	defer userDB.Close()

	// Test uuid-ossp extension
	t.Run("UUIDOSSP", func(t *testing.T) {
		var generatedUUID string
		err := userDB.QueryRow("SELECT uuid_generate_v4()").Scan(&generatedUUID)
		if err != nil {
			t.Fatalf("Failed to generate UUID using uuid_generate_v4(): %v", err)
		}
		if _, err := uuid.Parse(generatedUUID); err != nil {
			t.Fatalf("Generated string is not a valid UUID: %v", err)
		}
		t.Logf("Successfully generated UUID: %s", generatedUUID)
	})

	// Test pgvector extension
	t.Run("PGVector", func(t *testing.T) {
		// Create a table with a vector column
		_, err := userDB.Exec("CREATE TABLE items (id serial PRIMARY KEY, embedding vector(3))")
		if err != nil {
			t.Fatalf("Failed to create table with vector column: %v", err)
		}
		defer func() {
			_, err := userDB.Exec("DROP TABLE items")
			if err != nil {
				t.Errorf("Failed to drop table items: %v", err)
			}
		}()

		// Insert data
		_, err = userDB.Exec("INSERT INTO items (embedding) VALUES ('[1,2,3]'), ('[4,5,6]')")
		if err != nil {
			t.Fatalf("Failed to insert data into vector table: %v", err)
		}

		// Query data
		var embedding string
		err = userDB.QueryRow("SELECT embedding FROM items WHERE id = 1").Scan(&embedding)
		if err != nil {
			t.Fatalf("Failed to query data from vector table: %v", err)
		}
		if embedding != "[1,2,3]" {
			t.Errorf("Expected embedding '[1,2,3]', got '%s'", embedding)
		}
		t.Logf("Successfully used pgvector: %s", embedding)
	})

	// Test creating a new extension
	t.Run("CreateExtension", func(t *testing.T) {
		// Attempt to create an extension that is not pre-installed.
		// 'hstore' is a good candidate as it's a standard contrib module.
		_, err := userDB.Exec(`CREATE EXTENSION IF NOT EXISTS "hstore"`)
		if err != nil {
			t.Fatalf("User with write role failed to create extension 'hstore': %v", err)
		}
		t.Logf("Successfully created extension 'hstore'")

		// Drop the extension to clean up the state for other tests.
		_, err = userDB.Exec(`DROP EXTENSION IF EXISTS "hstore"`)
		if err != nil {
			t.Fatalf("User with write role failed to drop extension 'hstore': %v", err)
		}
		t.Logf("Successfully dropped extension 'hstore'")
	})
}

func TestSanitizeIdentifier(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		want      string
		expectErr bool
		errSubstr string // Substring to check for in the error message
	}{
		// Valid cases
		{"valid simple", "mydb", "mydb", false, ""},
		{"valid with numbers", "mydb123", "mydb123", false, ""},
		{"valid with underscores", "my_db_123", "my_db_123", false, ""},
		{"valid single char", "a", "a", false, ""},
		{"valid max length", strings.Repeat("a", 63), strings.Repeat("a", 63), false, ""},

		// Invalid cases - pattern mismatch
		{"invalid start with number", "1mydb", "", true, "must start with a lowercase letter"},
		{"invalid start with underscore", "_mydb", "", true, "must start with a lowercase letter"},
		{"invalid with uppercase", "MyDb", "", true, "contain only lowercase letters"},
		{"invalid with hyphen", "my-db", "", true, "contain only lowercase letters"},
		{"invalid with space", "my db", "", true, "contain only lowercase letters"},
		{"invalid with special char", "mydb!", "", true, "contain only lowercase letters"},
		{"invalid empty string", "", "", true, "must start with a lowercase letter"}, // or "invalid" depending on exact error

		// Invalid cases - too long
		{"invalid too long", strings.Repeat("a", 64), "", true, "exceeds maximum length"},

		// Cases that would have been changed by old sanitizer but now error
		{"old: leading number", "1database", "", true, "must start with a lowercase letter"},
		{"old: uppercase", "UPPERCASEDB", "", true, "contain only lowercase letters"},
		{"old: hyphens", "hyphen-db-name", "", true, "contain only lowercase letters"},
		{"old: spaces", "db with spaces", "", true, "contain only lowercase letters"},
		{"old: mixed issues", "1_My-Db!", "", true, "must start with a lowercase letter"}, // Error could be for start or chars
		{"old: starts with underscore then fixed", "_fixed_db", "", true, "must start with a lowercase letter"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := sanitizeIdentifier(tt.input)
			if tt.expectErr {
				if err == nil {
					t.Errorf("sanitizeIdentifier(%q) expected error, got nil", tt.input)
					return
				}
				if tt.errSubstr != "" && !strings.Contains(err.Error(), tt.errSubstr) {
					t.Errorf("sanitizeIdentifier(%q) error = %v, expected error containing %q", tt.input, err, tt.errSubstr)
				}
			} else {
				if err != nil {
					t.Errorf("sanitizeIdentifier(%q) unexpected error: %v", tt.input, err)
					return
				}
				if got != tt.want {
					t.Errorf("sanitizeIdentifier(%q) = %q, want %q", tt.input, got, tt.want)
				}
			}
		})
	}
}
