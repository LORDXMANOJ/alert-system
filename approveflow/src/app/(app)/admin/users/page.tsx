import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can, ROLES, ROLE_LABELS, type Role } from "@/server/permissions";
import { Badge, Card, PageHeader, Field, TableWrap, selectCls, th, td } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { setRoleAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const ASSIGNABLE: Role[] = ["admin", "bureau", "evc", "reviewer", "authority", "auditor"];

export default async function UsersPage() {
  const actor = (await getCurrentActor())!;
  if (!can(actor, "admin.manage")) redirect("/");
  const db = await getDb();
  const users = await db.query<{ id: string; name: string; designation: string; role: Role; institution_name: string | null; region_name: string | null }>(
    `SELECT u.id, u.name, u.designation, u.role, i.name AS institution_name, r.name AS region_name
     FROM users u LEFT JOIN institutions i ON i.id = u.institution_id LEFT JOIN regions r ON r.id = u.region_id
     ORDER BY u.role, u.name`,
  );

  return (
    <>
      <PageHeader
        title="Users & permissions"
        description="Assign the staff roles used in this prototype. Institution and regional users keep their scope. You cannot change your own role, and every change is recorded."
      />
      <div className="mb-6 border border-line-2 bg-ink-3 p-4 text-sm text-lilac">
        Roles are proposed for the prototype and are not official AICTE designations. Confirm real responsibilities before any production use.
      </div>
      <Card bodyClassName="px-0 py-0" title="Accounts">
        <TableWrap>
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line bg-transparent">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Designation</th>
                <th className={th}>Scope</th>
                <th className={th}>Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.rows.map((u) => {
                const scoped = u.role === "institution" || u.role === "regional";
                const self = u.id === actor.id;
                return (
                  <tr key={u.id} className="align-middle">
                    <td className={td}>
                      <p className="font-medium text-fg">{u.name}{self ? <Badge tone="info" className="ml-2">You</Badge> : null}</p>
                      <p className="font-mono text-xs text-fg-3">{u.id}</p>
                    </td>
                    <td className={td}>{u.designation}</td>
                    <td className={td}>{u.institution_name ?? (u.region_name ? `${u.region_name} region` : "National")}</td>
                    <td className={td}>
                      {scoped || self ? (
                        <Badge tone="neutral">{ROLE_LABELS[u.role]}{self ? " (cannot change own role)" : " (scoped)"}</Badge>
                      ) : (
                        <ServerForm action={setRoleAction} submit="Save" variant="secondary" resetOnSuccess={false} className="flex items-end gap-2" ariaLabel={`Change role for ${u.name}`}>
                          <input type="hidden" name="userId" value={u.id} />
                          <Field label="Role" htmlFor={`role-${u.id}`} className="min-w-[200px]">
                            <select id={`role-${u.id}`} name="role" defaultValue={u.role} className={selectCls}>
                              {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          </Field>
                        </ServerForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <p className="mt-4 text-xs text-fg-3">Roles in this list: {ROLES.map((r) => ROLE_LABELS[r]).join(", ")}. The save button is hidden for accounts that are scoped.</p>
    </>
  );
}
