import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWishlist } from '../context/WishlistContext';

export function WishlistToggle({ productId, name }: { productId: number; name: string }) {
  const { user } = useAuth();
  const wishlist = useWishlist();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const saved = wishlist.has(productId);

  const onClick = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setBusy(true);
    try {
      if (saved) {
        await wishlist.remove(productId);
        show(`${name} removed from your wishlist`, 'info');
      } else {
        await wishlist.add(productId);
        show(`${name} added to your wishlist`, 'success');
      }
    } catch (err) {
      show(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={saved ? 'wishlist-toggle saved' : 'wishlist-toggle'}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      disabled={busy}
      onClick={onClick}
      data-testid="wishlist-toggle"
    >
      <span aria-hidden="true">{saved ? '♥' : '♡'}</span>
      <span className="wishlist-toggle-label">{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}
