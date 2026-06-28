import xmlrpc.client
from dataclasses import dataclass
from fastapi import Depends, HTTPException, status
from .config import Settings, get_settings


@dataclass
class OdooUser:
    odoo_user_id: int
    odoo_employee_id: int | None
    full_name: str
    email: str
    department: str | None
    job_title: str | None
    is_active: bool


class OdooClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.common = xmlrpc.client.ServerProxy(f"{settings.odoo_url}/xmlrpc/2/common")
        self.models = xmlrpc.client.ServerProxy(f"{settings.odoo_url}/xmlrpc/2/object")

    def verify_user(self, email: str, password: str) -> OdooUser:
        uid = self.common.authenticate(self.settings.odoo_db, email, password, {})
        if not uid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Odoo credentials")

        users = self.models.execute_kw(
            self.settings.odoo_db,
            uid,
            password,
            "res.users",
            "read",
            [[uid]],
            {"fields": ["id", "name", "login", "email", "active", "employee_id"]},
        )
        if not users:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Odoo user not found")

        user = users[0]
        employee_id = user.get("employee_id")[0] if user.get("employee_id") else None
        department = None
        job_title = None
        if employee_id:
            employees = self.models.execute_kw(
                self.settings.odoo_db,
                uid,
                password,
                "hr.employee",
                "read",
                [[employee_id]],
                {"fields": ["department_id", "job_title"]},
            )
            if employees:
                employee = employees[0]
                department = employee.get("department_id")[1] if employee.get("department_id") else None
                job_title = employee.get("job_title")

        return OdooUser(
            odoo_user_id=user["id"],
            odoo_employee_id=employee_id,
            full_name=user.get("name") or email,
            email=user.get("email") or user.get("login") or email,
            department=department,
            job_title=job_title,
            is_active=bool(user.get("active")),
        )


def get_odoo_client(settings: Settings = Depends(get_settings)) -> OdooClient:
    return OdooClient(settings)
