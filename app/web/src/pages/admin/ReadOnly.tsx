import { ReactElement } from 'react';
import { Tooltip } from '../../components/Tooltip';
import { useAuth } from '../../context/AuthContext';

export function useCanEdit(): boolean {
  return useAuth().user?.role === 'admin';
}

/** Wraps an edit control: support users get it disabled, with a tooltip explaining why. */
export function EditControl({ children, id }: { children: ReactElement; id: string }) {
  const canEdit = useCanEdit();
  if (canEdit) return children;
  return (
    <Tooltip content="Read-only access: only admins can make changes" testId={`read-only-tooltip-${id}`}>
      {children}
    </Tooltip>
  );
}
