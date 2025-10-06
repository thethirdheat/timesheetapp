import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Timesheet: a
    .model({
      description: a.string(),
      rate: a.float(),
      lineItems: a.hasMany('LineItem', 'timesheetId'),
    })
    .authorization((allow) => [allow.owner()]),

  LineItem: a
    .model({
      timesheetId: a.id(),
      date: a.date(),
      minutes: a.float(),
      timesheet: a.belongsTo('Timesheet', 'timesheetId'),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
