import { useCallback } from "react";
import { useRecoilState, atom } from "recoil";
const toastState = atom({
  key: "toastState",
  default: {
    title: "",
    description: "",
    buttonAction: () => {},
  },
});
function useShowToast() {
  const [state, setState] = useRecoilState(toastState);
  return {
    showToast: ({ title, description, buttonAction }) => {
      setState({
        title,
        description,
        buttonAction,
      });
    },
  };
}
function useToastState() {
  const [state, setState] = useRecoilState(toastState);
  return state;
}

function MyComp() {
  const { showToast } = useShowToast();
  const handleClick = useCallback(() => {
    showToast({
      title: "Hello",
      description: "This is a toast",
      buttonAction: () => {
        alert("Hello");
      },
    });
  });
  return (
    <div>
      <button onClick={handleClick}>Say Hello</button>
    </div>
  );
}
