-- Staff must not see any shift, including their own, until the rota is published.
-- Only people who can view the whole rota for that department see drafts.
drop policy shifts_read on workplace.shifts;
create policy shifts_read on workplace.shifts for select to authenticated using (
  workplace.has_perm(business_id, 'rota.view_all', null, department_id)
  or (
    published_at is not null
    and (
      person_id = workplace.my_person_id(business_id)
      or exists (
        select 1 from workplace.person_departments pd
        where pd.department_id = shifts.department_id
          and pd.person_id = workplace.my_person_id(shifts.business_id)
      )
    )
  )
);
