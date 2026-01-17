"""Replace show_white with uniform_size

Revision ID: 003_replace_show_white
Revises: 002_add_projects
Create Date: 2026-01-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_replace_show_white'
down_revision = '002_add_projects'
branch_labels = None
depends_on = None


def upgrade():
    # Удаляем столбец show_white
    with op.batch_alter_table('diagrams') as batch_op:
        batch_op.drop_column('show_white')
        # Добавляем столбец uniform_size
        batch_op.add_column(sa.Column('uniform_size', sa.Integer(), server_default='0', nullable=True))


def downgrade():
    # Возвращаем show_white
    with op.batch_alter_table('diagrams') as batch_op:
        batch_op.drop_column('uniform_size')
        batch_op.add_column(sa.Column('show_white', sa.Integer(), server_default='1', nullable=True))
