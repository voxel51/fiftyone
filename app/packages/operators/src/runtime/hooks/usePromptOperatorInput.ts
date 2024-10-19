import { useSetRecoilState } from "recoil";
import { recentlyUsedOperatorsState, promptingOperatorState } from "../recoil";

type PromptOptions = {
  operatorName: string;
  params?: object;
  options?: object;
};

type UsePromptOperatorInputReturn = (options: PromptOptions) => void;

/**
 * usePromptOperatorInput
 *
 * A hook to prompt the operator input and update the state.
 *
 * @returns {UsePromptOperatorInputReturn} - A function to set the prompting operator and update the recently used operators.
 */
export default function usePromptOperatorInput(): UsePromptOperatorInputReturn {
  const setRecentlyUsedOperators = useSetRecoilState(
    recentlyUsedOperatorsState
  );
  const setPromptingOperator = useSetRecoilState(promptingOperatorState);

  const prompt = ({
    operatorName,
    params = {},
    options = {},
  }: PromptOptions) => {
    setRecentlyUsedOperators((recentlyUsedOperators) => {
      const update = new Set([operatorName, ...recentlyUsedOperators]);
      return Array.from(update).slice(0, 5);
    });

    setPromptingOperator({
      operatorName,
      params,
      options,
      initialParams: params,
    });
  };

  return prompt;
}
