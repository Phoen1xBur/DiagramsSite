"""Add cascade delete and make project_id required

Revision ID: 007_add_cascade_delete
Revises: 006_subscription_configs
Create Date: 2026-01-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '007_add_cascade_delete'
down_revision = '006_subscription_configs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    
    # Шаг 1: Создаем дефолтные проекты для всех пользователей, у которых их нет
    connection.execute(text("""
        INSERT INTO projects (user_id, name, description, created_at, updated_at)
        SELECT 
            u.id,
            'Мой проект',
            'Проект по умолчанию',
            NOW(),
            NOW()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM projects p WHERE p.user_id = u.id
        )
    """))
    
    # Шаг 2: Привязываем файлы без project_id к первому существующему проекту пользователя
    connection.execute(text("""
        UPDATE data_files df
        SET project_id = (
            SELECT p.id 
            FROM projects p 
            WHERE p.user_id = df.user_id 
            ORDER BY p.created_at ASC 
            LIMIT 1
        )
        WHERE df.project_id IS NULL 
        AND df.user_id IS NOT NULL
    """))
    
    # Шаг 3: Привязываем диаграммы без project_id к первому существующему проекту пользователя
    connection.execute(text("""
        UPDATE diagrams d
        SET project_id = (
            SELECT p.id 
            FROM projects p 
            WHERE p.user_id = d.user_id 
            ORDER BY p.created_at ASC 
            LIMIT 1
        )
        WHERE d.project_id IS NULL 
        AND d.user_id IS NOT NULL
    """))
    
    # Шаг 4: Удаляем анонимные данные без project_id (если такие есть)
    # Для анонимных пользователей (user_id IS NULL) удаляем данные, так как у них нет проектов
    connection.execute(text("""
        DELETE FROM data_files 
        WHERE project_id IS NULL AND user_id IS NULL
    """))
    
    connection.execute(text("""
        DELETE FROM diagrams 
        WHERE project_id IS NULL AND user_id IS NULL
    """))
    
    # Шаг 5: Пересоздаем foreign key с CASCADE для data_files
    op.drop_constraint('fk_data_files_project_id', 'data_files', type_='foreignkey')
    op.create_foreign_key(
        'fk_data_files_project_id', 
        'data_files', 
        'projects', 
        ['project_id'], 
        ['id'],
        ondelete='CASCADE'
    )
    
    # Шаг 6: Делаем project_id обязательным для data_files
    op.alter_column('data_files', 'project_id',
                    existing_type=sa.Integer(),
                    nullable=False)
    
    # Шаг 7: Пересоздаем foreign key с CASCADE для diagrams
    op.drop_constraint('fk_diagrams_project_id', 'diagrams', type_='foreignkey')
    op.create_foreign_key(
        'fk_diagrams_project_id', 
        'diagrams', 
        'projects', 
        ['project_id'], 
        ['id'],
        ondelete='CASCADE'
    )
    
    # Шаг 8: Делаем project_id обязательным для diagrams
    op.alter_column('diagrams', 'project_id',
                    existing_type=sa.Integer(),
                    nullable=False)


def downgrade() -> None:
    # Шаг 1: Возвращаем project_id к nullable для diagrams
    op.alter_column('diagrams', 'project_id',
                    existing_type=sa.Integer(),
                    nullable=True)
    
    # Шаг 2: Возвращаем foreign key без CASCADE для diagrams
    op.drop_constraint('fk_diagrams_project_id', 'diagrams', type_='foreignkey')
    op.create_foreign_key(
        'fk_diagrams_project_id', 
        'diagrams', 
        'projects', 
        ['project_id'], 
        ['id']
    )
    
    # Шаг 3: Возвращаем project_id к nullable для data_files
    op.alter_column('data_files', 'project_id',
                    existing_type=sa.Integer(),
                    nullable=True)
    
    # Шаг 4: Возвращаем foreign key без CASCADE для data_files
    op.drop_constraint('fk_data_files_project_id', 'data_files', type_='foreignkey')
    op.create_foreign_key(
        'fk_data_files_project_id', 
        'data_files', 
        'projects', 
        ['project_id'], 
        ['id']
    )
