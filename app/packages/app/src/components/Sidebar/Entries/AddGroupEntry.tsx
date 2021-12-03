import { useRecoilState } from "recoil";

const AddGroupDiv = styled.div`
  box-sizing: border-box;
  background-color: transparent;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  padding-top: 2px;

  display: flex;
  justify-content: space-between;

  & > input {
    color: ${({ theme }) => theme.fontDark};
    font-size: 14px !important;
    font-size: 1rem;
    width: 100%;
    background: transparent;
    box-shadow: none;
    border: none;
    outline: none;
    border-bottom: 2px solid ${({ theme }) => theme.backgroundLight};
    text-transform: uppercase;
    font-weight: bold;
    padding: 3px;
  }
`;

const AddGroup = ({
  modal,
  onSubmit,
}: {
  modal: boolean;
  onSubmit: (name: string) => void;
}) => {
  const [value, setValue] = useState("");
  const currentGroups = useRecoilValue(sidebarGroupNames(modal));

  return (
    <AddGroupDiv>
      <input
        type={"text"}
        placeholder={"+ add group"}
        value={value}
        maxLength={140}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.length) {
            if (!currentGroups.includes(value)) {
              onSubmit(value);
              setValue("");
            } else {
              alert(`${value.toUpperCase()} is already a group name`);
            }
          }
        }}
      />
    </AddGroupDiv>
  );
};

const AddGridGroup = () => {
  const [entries, setEntries] = useRecoilState(sidebarEntries(false));

  return (
    <AddGroup
      onSubmit={(name) => {
        const newEntries = [...entries];
        newEntries.splice(entries.length - 1, 0, {
          kind: EntryKind.GROUP,
          name,
        });

        setEntries(newEntries);
      }}
      modal={false}
    />
  );
};
