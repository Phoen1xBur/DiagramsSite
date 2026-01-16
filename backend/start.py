#!/usr/bin/env python3
"""Startup script for the backend application."""
import subprocess
import sys
import time
import socket
import os

def wait_for_postgres(host='postgres', port=5432, timeout=60):
    """Wait for PostgreSQL to be ready."""
    print("Waiting for postgres...")
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                print("Postgres is up!")
                return True
        except Exception as e:
            pass
        
        print("Postgres is unavailable - sleeping")
        time.sleep(1)
    
    print(f"Timeout waiting for postgres after {timeout} seconds")
    return False

def run_migrations():
    """Run database migrations."""
    print("Running migrations...")
    try:
        subprocess.run(['alembic', 'upgrade', 'head'], check=True)
        print("Migrations completed successfully")
    except subprocess.CalledProcessError as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

def start_server():
    """Start the uvicorn server."""
    print("Starting server...")
    os.execvp('uvicorn', [
        'uvicorn',
        'app.main:app',
        '--host', '0.0.0.0',
        '--port', '8000',
        '--reload'
    ])

if __name__ == '__main__':
    if not wait_for_postgres():
        sys.exit(1)
    
    run_migrations()
    start_server()
