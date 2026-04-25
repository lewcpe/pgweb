package dbutils

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// buildDSNWithDB appends the database name to the DSN connection string.
// Input DSN: "postgres://user:pass@host:port/defaultdb?sslmode=disable"
// Output:    "postgres://user:pass@host:port/dbname?sslmode=disable"
func buildDSNWithDB(adminDSN string, dbName string) string {
	// Parse and replace the database name in the DSN
	// The DSN looks like: postgres://user:pass@host:port/olddb?params
	// We need to replace the database portion
	idx := strings.Index(adminDSN, "://")
	if idx == -1 {
		return adminDSN + " dbname=" + dbName
	}
	scheme := adminDSN[:idx+3]
	rest := adminDSN[idx+3:]

	// Find the query string
	queryIdx := strings.Index(rest, "?")
	var query string
	if queryIdx >= 0 {
		query = rest[queryIdx:]
		rest = rest[:queryIdx]
	}

	// Find the path (database name) - after the last /
	slashIdx := strings.LastIndex(rest, "/")
	if slashIdx >= 0 {
		rest = rest[:slashIdx+1] + dbName
	}

	return scheme + rest + query
}

// DumpDatabaseToFile runs pg_dump and writes the output to the specified file path.
// Uses the custom format (-Fc) which is compressed and supports selective restore.
// Returns the file size on success.
func DumpDatabaseToFile(adminDSN string, dbName string, filePath string) (int64, error) {
	dsn := buildDSNWithDB(adminDSN, dbName)
	cmd := exec.Command("pg_dump", dsn, "-Fc")

	outFile, err := os.Create(filePath)
	if err != nil {
		return 0, fmt.Errorf("failed to create dump file: %w", err)
	}
	defer outFile.Close()

	cmd.Stdout = outFile

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		os.Remove(filePath)
		return 0, fmt.Errorf("pg_dump failed: %s: %w", stderr.String(), err)
	}

	info, err := outFile.Stat()
	if err != nil {
		return 0, fmt.Errorf("failed to stat dump file: %w", err)
	}

	return info.Size(), nil
}

// RestoreDatabaseFromReader runs pg_restore reading from the provided reader.
func RestoreDatabaseFromReader(adminDSN string, dbName string, reader io.Reader) error {
	dsn := buildDSNWithDB(adminDSN, dbName)
	cmd := exec.Command("pg_restore", "-d", dsn, "--clean", "--if-exists", "--no-owner", "--no-privileges")
	cmd.Stdin = reader

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		// pg_restore returns exit code 1 for warnings (errors ignored on restore)
		// which are non-fatal. Only treat exit code >= 2 as a real failure.
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() <= 1 {
			// Warnings only - restore succeeded with some non-critical warnings
			return nil
		}
		return fmt.Errorf("pg_restore failed: %s: %w", stderr.String(), err)
	}

	return nil
}

// RestoreDatabaseFromFile runs pg_restore from a file path.
func RestoreDatabaseFromFile(adminDSN string, dbName string, filePath string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open dump file: %w", err)
	}
	defer f.Close()

	return RestoreDatabaseFromReader(adminDSN, dbName, f)
}

// CleanupOldDumpFiles removes dump files older than maxAge from the backup directory.
// Called on server startup to clean up orphaned files from previous runs.
func CleanupOldDumpFiles(backupDir string, maxAge time.Duration) {
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		log.Printf("Warning: failed to read backup directory %s: %v", backupDir, err)
		return
	}

	cutoff := time.Now().Add(-maxAge)
	removed := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(name, ".dump") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := filepath.Join(backupDir, name)
			if err := os.Remove(path); err != nil {
				log.Printf("Warning: failed to remove old dump file %s: %v", path, err)
			} else {
				removed++
			}
		}
	}
	if removed > 0 {
		log.Printf("Cleaned up %d old dump file(s) from %s", removed, backupDir)
	}
}
