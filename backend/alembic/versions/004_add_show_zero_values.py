"""Add show_zero_values column

Revision ID: 004_add_show_zero_values
Revises: 003_replace_show_white
Create Date: 2026-01-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_add_show_zero_values'
down_revision = '003_replace_show_white'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('diagrams') as batch_op:
        batch_op.add_column(sa.Column('show_zero_values', sa.Integer(), server_default='1', nullable=True))


def downgrade():
    with op.batch_alter_table('diagrams') as batch_op:
        batch_op.drop_column('show_zero_values')
