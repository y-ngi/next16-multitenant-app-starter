'use client';

import { useState } from 'react';
import { CreateOrganizationDialog } from './create-organization-dialog';
import { OrganizationList } from './organization-list';

export function OrganizationSection() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateOrganizationDialog onSuccess={() => setRefreshKey((prev) => prev + 1)} />
      </div>
      <OrganizationList refreshKey={refreshKey} />
    </div>
  );
}
