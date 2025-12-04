"""Add projects and subscription system

Revision ID: 002_add_projects
Revises: 001_initial
Create Date: 2024-01-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_projects'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add subscription_type to users
    op.add_column('users', sa.Column('subscription_type', sa.String(), nullable=True))
    # Set default to 'basic' for existing users
    op.execute("UPDATE users SET subscription_type = 'basic' WHERE subscription_type IS NULL")
    op.alter_column('users', 'subscription_type', nullable=False)
    
    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], )
    )
    op.create_index(op.f('ix_projects_id'), 'projects', ['id'], unique=False)
    
    # Add project_id to data_files
    op.add_column('data_files', sa.Column('project_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_data_files_project_id', 'data_files', 'projects', ['project_id'], ['id'])
    
    # Add project_id to diagrams
    op.add_column('diagrams', sa.Column('project_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_diagrams_project_id', 'diagrams', 'projects', ['project_id'], ['id'])


def downgrade() -> None:
    # Remove foreign keys and columns
    op.drop_constraint('fk_diagrams_project_id', 'diagrams', type_='foreignkey')
    op.drop_column('diagrams', 'project_id')
    
    op.drop_constraint('fk_data_files_project_id', 'data_files', type_='foreignkey')
    op.drop_column('data_files', 'project_id')
    
    # Drop projects table
    op.drop_index(op.f('ix_projects_id'), table_name='projects')
    op.drop_table('projects')
    
    # Remove subscription_type from users
    op.drop_column('users', 'subscription_type')

