"""add dynamic_font_size column

Revision ID: 010_add_dynamic_font_size
Revises: 009_add_show_full_text
Create Date: 2026-01-25

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010_add_dynamic_font_size'
down_revision = '009_add_show_full_text'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем колонку dynamic_font_size в таблицу diagrams
    op.add_column('diagrams', sa.Column('dynamic_font_size', sa.Integer(), nullable=True, server_default='0'))


def downgrade():
    op.drop_column('diagrams', 'dynamic_font_size')
