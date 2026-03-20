"""Command-line tool to create an Efty user account.

Usage:
    python create_user.py <username>
"""

import getpass
import sqlite3
import sys

from werkzeug.security import generate_password_hash

import server


def main():
    """Prompt for a password and create a new user in the database."""
    if len(sys.argv) != 2:
        print("Usage: python create_user.py <username>")
        sys.exit(1)

    username = sys.argv[1].strip()
    if not username:
        print("Error: username cannot be blank.")
        sys.exit(1)

    password = getpass.getpass(f"Password for '{username}': ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Error: passwords do not match.")
        sys.exit(1)

    if len(password) < 8:
        print("Error: password must be at least 8 characters.")
        sys.exit(1)

    with server.app.app_context():
        db = server.get_db()
        try:
            db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            db.commit()
            print(f"User '{username}' created.")
        except sqlite3.IntegrityError:
            print(f"Error: username '{username}' is already taken.")
            sys.exit(1)


if __name__ == "__main__":
    main()
