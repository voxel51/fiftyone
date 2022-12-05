export const measure = ({
  logBefore = false,
  logAfter = false,
  identifier = "",
}: {
  logBefore?: boolean;
  logAfter?: boolean;
  identifier?: string;
}) => {
  return (target: any, memberName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;

    descriptor.value = async () => {
      const start = performance.now();
      logBefore &&
        console.log(`${identifier} ${memberName} execution start at ${start}`);
      try {
        await method.apply(this);
      } catch {}
      logAfter &&
        console.log(`${identifier} ${memberName} execution end at ${start}`);
      const end = performance.now();
      console.log(
        `${identifier} ${memberName} execution time = ${
          end - start
        } milliseconds`
      );
    };
  };
};
