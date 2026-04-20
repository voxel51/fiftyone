import { parse } from "@foxglove/rosmsg";
import { MessageReader } from "@foxglove/rosmsg2-serialization";

const TF_MESSAGE_DEFINITION = `geometry_msgs/msg/TransformStamped[] transforms
================================================================================
MSG: geometry_msgs/msg/TransformStamped
std_msgs/msg/Header header
string child_frame_id
geometry_msgs/msg/Transform transform
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/msg/Transform
geometry_msgs/msg/Vector3 translation
geometry_msgs/msg/Quaternion rotation
================================================================================
MSG: geometry_msgs/msg/Vector3
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const ODOMETRY_DEFINITION = `std_msgs/msg/Header header
string child_frame_id
geometry_msgs/msg/PoseWithCovariance pose
geometry_msgs/msg/TwistWithCovariance twist
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/msg/PoseWithCovariance
geometry_msgs/msg/Pose pose
float64[36] covariance
================================================================================
MSG: geometry_msgs/msg/Pose
geometry_msgs/msg/Point position
geometry_msgs/msg/Quaternion orientation
================================================================================
MSG: geometry_msgs/msg/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w
================================================================================
MSG: geometry_msgs/msg/TwistWithCovariance
geometry_msgs/msg/Twist twist
float64[36] covariance
================================================================================
MSG: geometry_msgs/msg/Twist
geometry_msgs/msg/Vector3 linear
geometry_msgs/msg/Vector3 angular
================================================================================
MSG: geometry_msgs/msg/Vector3
float64 x
float64 y
float64 z`;

const POSE_STAMPED_DEFINITION = `std_msgs/msg/Header header
geometry_msgs/msg/Pose pose
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/msg/Pose
geometry_msgs/msg/Point position
geometry_msgs/msg/Quaternion orientation
================================================================================
MSG: geometry_msgs/msg/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const POSE_WITH_COVARIANCE_STAMPED_DEFINITION = `std_msgs/msg/Header header
geometry_msgs/msg/PoseWithCovariance pose
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/msg/PoseWithCovariance
geometry_msgs/msg/Pose pose
float64[36] covariance
================================================================================
MSG: geometry_msgs/msg/Pose
geometry_msgs/msg/Point position
geometry_msgs/msg/Quaternion orientation
================================================================================
MSG: geometry_msgs/msg/Point
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/msg/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const NAV_SAT_FIX_DEFINITION = `std_msgs/msg/Header header
sensor_msgs/msg/NavSatStatus status
float64 latitude
float64 longitude
float64 altitude
float64[9] position_covariance
uint8 position_covariance_type
================================================================================
MSG: std_msgs/msg/Header
builtin_interfaces/msg/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/msg/Time
int32 sec
uint32 nanosec
================================================================================
MSG: sensor_msgs/msg/NavSatStatus
int8 STATUS_NO_FIX=-1
int8 STATUS_FIX=0
int8 STATUS_SBAS_FIX=1
int8 STATUS_GBAS_FIX=2
uint16 SERVICE_GPS=1
uint16 SERVICE_GLONASS=2
uint16 SERVICE_COMPASS=4
uint16 SERVICE_GALILEO=8
int8 status
uint16 service`;

type PoseMessage = {
  position: {
    x: number;
    y: number;
    z: number;
  };
  orientation: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
};

type HeaderMessage = {
  frame_id: string;
};

type TransformStampedMessage = {
  header: HeaderMessage;
  child_frame_id: string;
  transform: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
};

type TfMessage = {
  transforms: TransformStampedMessage[];
};

type OdometryMessage = {
  header: HeaderMessage;
  child_frame_id: string;
  pose: {
    pose: PoseMessage;
  };
};

type PoseStampedMessage = {
  header: HeaderMessage;
  pose: PoseMessage;
};

type PoseWithCovarianceStampedMessage = {
  header: HeaderMessage;
  pose: {
    pose: PoseMessage;
  };
};

type NavSatFixMessage = {
  header: HeaderMessage;
  latitude: number;
  longitude: number;
  altitude: number;
};

const tfReader = new MessageReader<TfMessage>(
  parse(TF_MESSAGE_DEFINITION, { ros2: true })
);
const odometryReader = new MessageReader<OdometryMessage>(
  parse(ODOMETRY_DEFINITION, { ros2: true })
);
const poseStampedReader = new MessageReader<PoseStampedMessage>(
  parse(POSE_STAMPED_DEFINITION, { ros2: true })
);
const poseWithCovarianceStampedReader =
  new MessageReader<PoseWithCovarianceStampedMessage>(
    parse(POSE_WITH_COVARIANCE_STAMPED_DEFINITION, { ros2: true })
  );
const navSatFixReader = new MessageReader<NavSatFixMessage>(
  parse(NAV_SAT_FIX_DEFINITION, { ros2: true })
);

export type DecodedTransform = {
  parentFrameId: string;
  childFrameId: string;
  translation: [number, number, number];
  rotation: [number, number, number, number];
};

export type DecodedPoseSample = {
  frameId: string;
  position: [number, number, number];
  orientation: [number, number, number, number] | null;
};

export type DecodedNavSatFixSample = {
  frameId: string;
  latitude: number;
  longitude: number;
  altitude: number;
};

function toPositionArray(position: PoseMessage["position"]) {
  return [position.x, position.y, position.z] as [number, number, number];
}

function toOrientationArray(orientation: PoseMessage["orientation"]) {
  return [orientation.x, orientation.y, orientation.z, orientation.w] as [
    number,
    number,
    number,
    number
  ];
}

export function decodeTfMessagePayload(
  payload: Uint8Array
): DecodedTransform[] {
  const message = tfReader.readMessage<TfMessage>(payload);
  return (message.transforms ?? []).map((transform) => ({
    parentFrameId: transform.header?.frame_id || "",
    childFrameId: transform.child_frame_id || "",
    translation: [
      transform.transform.translation.x,
      transform.transform.translation.y,
      transform.transform.translation.z,
    ],
    rotation: [
      transform.transform.rotation.x,
      transform.transform.rotation.y,
      transform.transform.rotation.z,
      transform.transform.rotation.w,
    ],
  }));
}

export function decodeOdometryPayload(
  payload: Uint8Array
): DecodedPoseSample & { childFrameId: string } {
  const message = odometryReader.readMessage<OdometryMessage>(payload);
  return {
    frameId: message.header?.frame_id || "",
    childFrameId: message.child_frame_id || "",
    position: toPositionArray(message.pose.pose.position),
    orientation: toOrientationArray(message.pose.pose.orientation),
  };
}

export function decodePoseStampedPayload(
  payload: Uint8Array
): DecodedPoseSample {
  const message = poseStampedReader.readMessage<PoseStampedMessage>(payload);
  return {
    frameId: message.header?.frame_id || "",
    position: toPositionArray(message.pose.position),
    orientation: toOrientationArray(message.pose.orientation),
  };
}

export function decodePoseWithCovarianceStampedPayload(
  payload: Uint8Array
): DecodedPoseSample {
  const message =
    poseWithCovarianceStampedReader.readMessage<PoseWithCovarianceStampedMessage>(
      payload
    );
  return {
    frameId: message.header?.frame_id || "",
    position: toPositionArray(message.pose.pose.position),
    orientation: toOrientationArray(message.pose.pose.orientation),
  };
}

export function decodeNavSatFixPayload(
  payload: Uint8Array
): DecodedNavSatFixSample {
  const message = navSatFixReader.readMessage<NavSatFixMessage>(payload);
  return {
    frameId: message.header?.frame_id || "",
    latitude: message.latitude,
    longitude: message.longitude,
    altitude: message.altitude,
  };
}
