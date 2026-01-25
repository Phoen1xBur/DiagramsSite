"""add show_full_text column

Revision ID: 009_add_show_full_text
Revises: 008_add_text_along_circumference
Create Date: 2026-01-23

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009_add_show_full_text'
down_revision = '008_add_text_along_circumference'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем колонку show_full_text в таблицу diagrams
    op.add_column('diagrams', sa.Column('show_full_text', sa.Integer(), nullable=True, server_default='0'))


def downgrade():
    op.drop_column('diagrams', 'show_full_text')
