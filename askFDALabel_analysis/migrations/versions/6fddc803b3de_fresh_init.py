"""fresh_init

Revision ID: 6fddc803b3de
Revises: 
Create Date: 2026-01-17 19:45:37.259025

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6fddc803b3de'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Helper to check if table exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- dict_assessment ---
    if 'dict_assessment' not in existing_tables:
        op.create_table('dict_assessment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('report_content', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('set_id')
        )

    # --- dili_assessment ---
    if 'dili_assessment' not in existing_tables:
        op.create_table('dili_assessment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('report_content', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('set_id')
        )

    # --- diri_assessment ---
    if 'diri_assessment' not in existing_tables:
        op.create_table('diri_assessment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('report_content', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('set_id')
        )

    # --- user ---
    if 'user' not in existing_tables:
        op.create_table('user',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=150), nullable=False),
        sa.Column('password_hash', sa.String(length=256), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username')
        )

    # --- annotation ---
    if 'annotation' not in existing_tables:
        op.create_table('annotation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('section_number', sa.String(length=50), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('keywords', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
        )

    # --- project ---
    if 'project' not in existing_tables:
        op.create_table('project',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('share_code', sa.String(length=36), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('share_code')
        )

    # --- favorite ---
    if 'favorite' not in existing_tables:
        op.create_table('favorite',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('brand_name', sa.String(length=200), nullable=True),
        sa.Column('manufacturer_name', sa.String(length=300), nullable=True),
        sa.Column('effective_time', sa.String(length=100), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
        )
    else:
        # Check if project_id exists in favorite
        columns = [c['name'] for c in inspector.get_columns('favorite')]
        if 'project_id' not in columns:
            op.add_column('favorite', sa.Column('project_id', sa.Integer(), nullable=True))
            op.create_foreign_key('fk_favorite_project_id', 'favorite', 'project', ['project_id'], ['id'])

    # --- favorite_comparison ---
    if 'favorite_comparison' not in existing_tables:
        op.create_table('favorite_comparison',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('set_ids', sa.Text(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
        )
    else:
        # Check if project_id exists in favorite_comparison
        columns = [c['name'] for c in inspector.get_columns('favorite_comparison')]
        if 'project_id' not in columns:
            op.add_column('favorite_comparison', sa.Column('project_id', sa.Integer(), nullable=True))
            op.create_foreign_key('fk_favorite_comparison_project_id', 'favorite_comparison', 'project', ['project_id'], ['id'])

    # --- label_annotation ---
    if 'label_annotation' not in existing_tables:
        op.create_table('label_annotation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('set_id', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('section_id', sa.String(length=100), nullable=False),
        sa.Column('start_offset', sa.Integer(), nullable=False),
        sa.Column('end_offset', sa.Integer(), nullable=False),
        sa.Column('selected_text', sa.Text(), nullable=False),
        sa.Column('annotation_type', sa.String(length=20), nullable=False),
        sa.Column('color', sa.String(length=20), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
        )

    # --- project_users ---
    if 'project_users' not in existing_tables:
        op.create_table('project_users',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['project.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('project_id', 'user_id')
        )

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('project_users')
    op.drop_table('label_annotation')
    op.drop_table('favorite_comparison')
    op.drop_table('favorite')
    op.drop_table('project')
    op.drop_table('annotation')
    op.drop_table('user')
    op.drop_table('diri_assessment')
    op.drop_table('dili_assessment')
    op.drop_table('dict_assessment')
    # ### end Alembic commands ###
