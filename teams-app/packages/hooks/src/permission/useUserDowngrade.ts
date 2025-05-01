import { atom, useRecoilState } from "recoil";

type SelectedDowngradeUserRoleState = {
  userId: string;
  userName: string;
  currentRole: string;
  newRole: string;
  onConfirm: () => void;
};

// This atom holds the state for the selected user to downgrade role
export const selectedDowngradeUserRoleState =
  atom<SelectedDowngradeUserRoleState>({
    key: "selectedDowngradeUserRoleState",
    default: null,
  });

// This atom holds the state for whether the downgrade user role modal is open
export const downgradeUserRoleModalOpenState = atom<boolean>({
  key: "downgradeUserRoleModalOpenState",
  default: false,
});

export const isDowngradingRole = atom<boolean>({
  key: "isDowngradingRole",
  default: false,
});

export default function useUserDowngrade() {
  // Custom hook logic for user downgrade can be implemented here
  const [downgradeUserRoleState, setDowngradeUserRoleState] = useRecoilState(
    selectedDowngradeUserRoleState
  );
  const [downgradeUserRoleModalOpen, setDowngradeUserRoleModalOpen] =
    useRecoilState(downgradeUserRoleModalOpenState);
  const [isLoading, setIsLoading] = useRecoilState(isDowngradingRole);

  const onClose = () => {
    setDowngradeUserRoleModalOpen(false);
    setDowngradeUserRoleState(null);
  };

  return {
    userId: downgradeUserRoleState?.userId,
    userName: downgradeUserRoleState?.userName,
    currentRole: downgradeUserRoleState?.currentRole,
    newRole: downgradeUserRoleState?.newRole,
    onConfirm: downgradeUserRoleState?.onConfirm,
    onClose: onClose,
    setDowngradeUserRoleState,
    downgradeUserRoleModalOpen,
    setDowngradeUserRoleModalOpen,
    loading: isLoading,
    setIsLoading: setIsLoading,
  };
}
