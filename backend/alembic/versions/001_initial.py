"""Initial migration

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create data_files table
    op.create_table(
        'data_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('file_type', sa.String(), nullable=False),
        sa.Column('columns', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('data', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('is_anonymous', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_data_files_id'), 'data_files', ['id'], unique=False)

    # Create diagrams table
    op.create_table(
        'diagrams',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('data_file_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('hierarchy_columns', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('value_column', sa.String(), nullable=True),
        sa.Column('show_white', sa.Integer(), nullable=True),
        sa.Column('use_gradient', sa.Integer(), nullable=True),
        sa.Column('chart_html', sa.Text(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('is_anonymous', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['data_file_id'], ['data_files.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_diagrams_id'), 'diagrams', ['id'], unique=False)

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # Add foreign keys
    op.create_foreign_key('fk_data_files_user_id', 'data_files', 'users', ['user_id'], ['id'])
    op.create_foreign_key('fk_diagrams_user_id', 'diagrams', 'users', ['user_id'], ['id'])


def downgrade() -> None:
    # Drop foreign keys
    op.drop_constraint('fk_diagrams_user_id', 'diagrams', type_='foreignkey')
    op.drop_constraint('fk_data_files_user_id', 'data_files', type_='foreignkey')
    
    # Drop users table
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
    
    # Drop diagrams table
    op.drop_index(op.f('ix_diagrams_id'), table_name='diagrams')
    op.drop_table('diagrams')
    
    # Drop data_files table
    op.drop_index(op.f('ix_data_files_id'), table_name='data_files')
    op.drop_table('data_files')
