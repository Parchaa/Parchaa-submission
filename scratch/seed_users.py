import database
import os

conn_str = os.getenv("DATABASE_URL", "postgresql://cdsco:cdsco123@localhost:5432/cdsco_regai")
database.init_db(conn_str)
database.Base.metadata.create_all(database._engine)

session = database.get_session()
try:
    if not session.query(database.User).filter_by(email="admin@cdscoregai.com").first():
        session.add(database.User(email="admin@cdscoregai.com", full_name="Admin User", role="admin"))
    if not session.query(database.User).filter_by(email="reviewer@cdscoregai.com").first():
        session.add(database.User(email="reviewer@cdscoregai.com", full_name="Standard User", role="standard"))
    session.commit()
    print("Updated Users created successfully.")
except Exception as e:
    print(f"Error: {e}")
finally:
    session.close()
