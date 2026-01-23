"""Add text_along_circumference field to diagrams

Revision ID: 008_add_text_along_circumference
Revises: 007_add_cascade_delete
Create Date: 2026-01-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008_add_text_along_circumference'
down_revision = '007_add_cascade_delete'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add text_along_circumference column to diagrams table
    op.add_column('diagrams', sa.Column('text_along_circumference', sa.Integer(), nullable=True))
    # Set default value to 0 (False) for existing rows
    op.execute("UPDATE diagrams SET text_along_circumference = 0 WHERE text_along_circumference IS NULL")
    # Make it not nullable
    op.alter_column('diagrams', 'text_along_circumference', nullable=False)


def downgrade() -> None:
    # Remove text_along_circumference column
    op.drop_column('diagrams', 'text_along_circumference')
