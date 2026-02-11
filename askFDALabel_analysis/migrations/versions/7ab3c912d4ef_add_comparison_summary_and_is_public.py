"""add comparison summary and is_public

Revision ID: 7ab3c912d4ef
Revises: 6fddc803b3de
Create Date: 2026-01-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7ab3c912d4ef'
down_revision = '6fddc803b3de'
branch_labels = None
depends_on = None


def upgrade():
    # Helper to check if table/column exists to avoid errors on re-run
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- comparison_summary ---
    if 'comparison_summary' not in existing_tables:
        op.create_table('comparison_summary',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('set_ids_hash', sa.String(length=64), nullable=False),
            sa.Column('set_ids', sa.Text(), nullable=False),
            sa.Column('summary_content', sa.Text(), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('set_ids_hash')
        )

    # --- annotation: is_public ---
    if 'annotation' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('annotation')]
        if 'is_public' not in columns:
            op.add_column('annotation', sa.Column('is_public', sa.Boolean(), server_default=sa.sql.expression.false(), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # --- annotation: is_public ---
    if 'annotation' in existing_tables:
        columns = [c['name'] for c in inspector.get_columns('annotation')]
        if 'is_public' in columns:
            with op.batch_alter_table('annotation') as batch_op:
                batch_op.drop_column('is_public')

    # --- comparison_summary ---
    if 'comparison_summary' in existing_tables:
        op.drop_table('comparison_summary')
