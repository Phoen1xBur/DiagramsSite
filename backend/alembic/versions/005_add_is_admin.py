"""add is_admin to users

Revision ID: 005_add_is_admin
Revises: 004_add_show_zero_values
Create Date: 2026-01-17

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '005_add_is_admin'
down_revision = '004_add_show_zero_values'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=True, server_default='false'))
    # Обновляем существующие записи
    op.execute("UPDATE users SET is_admin = false WHERE is_admin IS NULL")
    # Делаем колонку NOT NULL
    op.alter_column('users', 'is_admin', nullable=False, server_default='false')

def downgrade():
    op.drop_column('users', 'is_admin')
