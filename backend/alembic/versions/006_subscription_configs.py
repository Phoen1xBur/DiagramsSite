"""create subscription_configs table

Revision ID: 006_subscription_configs
Revises: 005_add_is_admin
Create Date: 2026-01-17

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006_subscription_configs'
down_revision = '005_add_is_admin'
branch_labels = None
depends_on = None

def upgrade():
    # Создаем таблицу
    op.create_table(
        'subscription_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subscription_type', sa.String(length=50), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('max_projects', sa.Integer(), nullable=False, server_default='-1'),
        sa.Column('max_files_per_project', sa.Integer(), nullable=False, server_default='-1'),
        sa.Column('max_diagrams_per_project', sa.Integer(), nullable=False, server_default='-1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_subscription_configs_id'), 'subscription_configs', ['id'], unique=False)
    op.create_index(op.f('ix_subscription_configs_subscription_type'), 'subscription_configs', ['subscription_type'], unique=True)
    
    # Добавляем дефолтные конфигурации
    op.execute("""
        INSERT INTO subscription_configs (subscription_type, display_name, max_projects, max_files_per_project, max_diagrams_per_project, created_at, updated_at)
        VALUES 
            ('basic', 'Базовая', 1, 3, 10, NOW(), NOW()),
            ('premium', 'Премиум', -1, -1, -1, NOW(), NOW()),
            ('enterprise', 'Корпоративная', -1, -1, -1, NOW(), NOW())
    """)

def downgrade():
    op.drop_index(op.f('ix_subscription_configs_subscription_type'), table_name='subscription_configs')
    op.drop_index(op.f('ix_subscription_configs_id'), table_name='subscription_configs')
    op.drop_table('subscription_configs')
